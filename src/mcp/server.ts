import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import type { DatabaseRole } from '../features/classes/models';
import { loadMcpDatabaseOptions } from './databaseConfig';
import { defaultMcpRowLimit, prepareReadOnlyQuery } from './readOnlyQuery';

// The SDK currently publishes declarations that require DOM and NodeNext types.
// Runtime imports keep this standalone entrypoint compatible with the extension's Node16 tsconfig.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');

const workspacePath = readArgument('--workspace');
const databaseRole = readRoleArgument();
const logsPath = readOptionalArgument('--logs');
const navigationInfoPath = readOptionalArgument('--navigation-info');
const server = new McpServer({ name: 'vc-ve-tools-database', version: '0.4.0' });

server.registerTool('search_classes', {
	description: 'Find East Express classes by name, title, alias, or numeric ID. Returns stable class IDs that can be passed to VS Code navigation tools.',
	inputSchema: {
		query: z.string().min(1).describe('Full or partial class name, title, alias, or class ID'),
		limit: z.number().int().min(1).max(50).optional().describe('Maximum matches to return, default 20'),
	},
	annotations: { readOnlyHint: true },
}, async ({ query, limit }: { query: string; limit?: number }) => databaseToolResult(async () => {
	const rows = await queryDatabase(
		`SELECT class.id, class.name, class.title, class.aliases, class.seniorid
		   FROM classes AS class
		  WHERE class.id::text = $1
		     OR class.name ILIKE $2
		     OR COALESCE(class.title::text, '') ILIKE $2
		     OR COALESCE(class.aliases::text, '') ILIKE $2
		  ORDER BY CASE WHEN lower(class.name) = lower($1) THEN 0 ELSE 1 END,
		           class.name
		  LIMIT $3`,
		[query.trim(), `%${query.trim()}%`, limit ?? 20],
	);
	return { query, count: rows.length, classes: rows };
}));

server.registerTool('get_class_details', {
	description: 'Read the full database card for an East Express class by its ID.',
	inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
	annotations: { readOnlyHint: true },
}, async ({ classId }: { classId: number }) => databaseToolResult(async () => {
	const rows = await queryDatabase(
		`SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
		   FROM classes AS class
		   LEFT JOIN classes AS child ON child.id = class.childclassid
		   LEFT JOIN classes AS parent ON parent.id = class.parentclassid
		  WHERE class.id = $1`,
		[classId],
	);
	return { found: rows.length === 1, class: rows[0] ?? null };
}));

server.registerTool('search_methods', {
	description: 'Find East Express methods by name or numeric ID, optionally within one class. Returns method IDs that can be opened by the VS Code navigation tool.',
	inputSchema: {
		query: z.string().min(1).describe('Full or partial method name, or method ID'),
		classId: z.number().int().positive().optional().describe('Optional owning class ID'),
		limit: z.number().int().min(1).max(50).optional().describe('Maximum matches to return, default 20'),
	},
	annotations: { readOnlyHint: true },
}, async ({ query, classId, limit }: { query: string; classId?: number; limit?: number }) => databaseToolResult(async () => {
	const rows = await queryDatabase(
		`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname
		   FROM methods AS method
		   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		  WHERE (method.id::text = $1 OR method.name ILIKE $2)
		    AND ($3::bigint IS NULL OR method.seniorid = $3)
		  ORDER BY CASE WHEN lower(method.name) = lower($1) THEN 0 ELSE 1 END,
		           method.name,
		           method.id
		  LIMIT $4`,
		[query.trim(), `%${query.trim()}%`, classId ?? null, limit ?? 20],
	);
	return { query, classId: classId ?? null, count: rows.length, methods: rows };
}));

server.registerTool('reveal_class', {
	description: 'Reveal an East Express class in the vc-ve-tools Explorer without using mouse or keyboard automation. First resolve the class ID with search_classes.',
	inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
	annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ classId }: { classId: number }) => navigationToolResult('reveal_class', classId));

server.registerTool('open_class', {
	description: 'Reveal an East Express class in the vc-ve-tools Explorer and open its class card in VS Code without cursor automation. First resolve the class ID with search_classes.',
	inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
	annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ classId }: { classId: number }) => navigationToolResult('open_class', classId));

server.registerTool('open_method', {
	description: 'Open an East Express method in the VS Code virtual editor without cursor automation. First resolve the method ID with search_methods.',
	inputSchema: { methodId: z.number().int().positive().describe('Method ID returned by search_methods') },
	annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ methodId }: { methodId: number }) => navigationToolResult('open_method', methodId));

server.registerTool('query_readonly', {
	description: 'Execute a read-only PostgreSQL SELECT/WITH/VALUES query against the current East Express project database.',
	inputSchema: {
		sql: z.string().min(1).describe('Read-only PostgreSQL query'),
		maxRows: z.number().int().min(1).max(500).optional().describe('Maximum rows to return (default 200, maximum 500)'),
	},
}, async ({ sql, maxRows }: { sql: string; maxRows?: number }) => {
	try {
		const options = await loadMcpDatabaseOptions(workspacePath, databaseRole);
		const client = new Client({ ...options, application_name: 'vc-ve-tools-mcp', connectionTimeoutMillis: 5000 });
		try {
			await client.connect();
			await client.query('BEGIN READ ONLY');
			await client.query("SET LOCAL statement_timeout = '10s'");
			await client.query("SET LOCAL lock_timeout = '2s'");
			const limit = maxRows ?? defaultMcpRowLimit;
			const result = await client.query<Record<string, unknown>>(prepareReadOnlyQuery(sql, limit));
			const truncated = result.rows.length > limit;
			const rows = result.rows.slice(0, limit).map(normalizeRow);
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ database: options.database, rowCount: rows.length, truncated, rows }, null, 2) }],
				structuredContent: { database: options.database, rowCount: rows.length, truncated, rows },
			};
		} finally {
			await client.query('ROLLBACK').catch(() => undefined);
			await client.end().catch(() => undefined);
		}
	} catch (error) {
		return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
	}
});

server.registerTool('get_recent_extension_errors', {
	description: 'Read recent vc-ve-tools errors. Use this first when diagnosing an extension or database failure.',
	inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('Maximum errors to return, default 30') },
	annotations: { readOnlyHint: true },
}, async ({ limit }: { limit?: number }) => logToolResult('error', limit ?? 30));

server.registerTool('get_extension_logs', {
	description: 'Read recent structured vc-ve-tools diagnostic events.',
	inputSchema: {
		level: z.enum(['info', 'warning', 'error']).optional(),
		limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return, default 50'),
	},
	annotations: { readOnlyHint: true },
}, async ({ level, limit }: { level?: 'info' | 'warning' | 'error'; limit?: number }) => logToolResult(level, limit ?? 50));

async function main(): Promise<void> {
	await server.connect(new StdioServerTransport());
}

function readArgument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (!value) {
		throw new Error(`Missing required argument ${name}.`);
	}
	return value;
}

function readOptionalArgument(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function logToolResult(level: string | undefined, limit: number) {
	if (!logsPath) {
		return { content: [{ type: 'text' as const, text: 'Extension log path is not configured.' }], isError: true };
	}
	try {
		const content = await readFile(logsPath, 'utf8');
		const records = content.split(/\r?\n/).filter(Boolean).flatMap(line => {
			try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
		});
		const filtered = records.filter(record => !level || record.level === level).slice(-limit).reverse();
		return {
			content: [{ type: 'text' as const, text: JSON.stringify({ count: filtered.length, records: filtered }, null, 2) }],
			structuredContent: { count: filtered.length, records: filtered },
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { content: [{ type: 'text' as const, text: JSON.stringify({ count: 0, records: [] }) }], structuredContent: { count: 0, records: [] } };
		}
		return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
	}
}

function readRoleArgument(): DatabaseRole {
	const value = readArgument('--database-role');
	if (value !== 'main' && value !== 'test') {
		throw new Error('--database-role must be main or test.');
	}
	return value;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

function normalizeValue(value: unknown): unknown {
	if (typeof value === 'bigint') {
		return value.toString();
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Buffer.isBuffer(value)) {
		return `<binary: ${value.byteLength} bytes>`;
	}
	return value;
}

async function queryDatabase(text: string, values: unknown[]): Promise<Record<string, unknown>[]> {
	const options = await loadMcpDatabaseOptions(workspacePath, databaseRole);
	const client = new Client({ ...options, application_name: 'vc-ve-tools-mcp', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		await client.query('BEGIN READ ONLY');
		await client.query("SET LOCAL statement_timeout = '10s'");
		await client.query("SET LOCAL lock_timeout = '2s'");
		const result = await client.query<Record<string, unknown>>(text, values);
		return result.rows.map(normalizeRow);
	} finally {
		await client.query('ROLLBACK').catch(() => undefined);
		await client.end().catch(() => undefined);
	}
}

async function databaseToolResult(load: () => Promise<Record<string, unknown>>) {
	try {
		const result = await load();
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
			structuredContent: result,
		};
	} catch (error) {
		return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
	}
}

async function navigationToolResult(action: 'reveal_class' | 'open_class' | 'open_method', id: number) {
	if (!navigationInfoPath) {
		return { content: [{ type: 'text' as const, text: 'VS Code navigation bridge is not configured. Start this MCP server from the vc-ve-tools extension.' }], isError: true };
	}
	try {
		const connection = JSON.parse(await readFile(navigationInfoPath, 'utf8')) as { url?: unknown; token?: unknown };
		if (typeof connection.url !== 'string' || typeof connection.token !== 'string') {
			throw new Error('VS Code navigation bridge information is invalid.');
		}
		const response = await fetch(connection.url, {
			method: 'POST',
			headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ action, id }),
			signal: AbortSignal.timeout(10_000),
		});
		const result = await response.json() as Record<string, unknown>;
		if (!response.ok) {
			throw new Error(typeof result.error === 'string' ? result.error : `Navigation bridge returned HTTP ${response.status}.`);
		}
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
			structuredContent: result,
		};
	} catch (error) {
		return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
	}
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
