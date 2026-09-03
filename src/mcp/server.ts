import { Client } from 'pg';
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
const server = new McpServer({ name: 'vc-ve-tools-database', version: '0.1.0' });

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

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
