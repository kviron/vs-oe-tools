import { z } from '../schemas';
import { activeDatabaseProfile, withMcpDatabaseSession } from '../databaseSession';
import { defaultMcpRowLimit, prepareReadOnlyQuery } from '../readOnlyQuery';
import { normalizeRow } from '../toolResult';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('query_readonly', {
		description: 'Execute a read-only PostgreSQL SELECT/WITH/VALUES query against the current East Express project database.',
		inputSchema: {
			sql: z.string().min(1).describe('Read-only PostgreSQL query'),
			maxRows: z.number().int().min(1).max(500).optional().describe('Maximum rows to return (default 200, maximum 500)'),
		},
	}, async ({ sql, maxRows }: { sql: string; maxRows?: number }) => {
		try {
			return withMcpDatabaseSession(async ({ client, options }) => {
				try {
				await client.query('BEGIN READ ONLY');
				await client.query("SET LOCAL statement_timeout = '10s'");
				await client.query("SET LOCAL lock_timeout = '2s'");
				const limit = maxRows ?? defaultMcpRowLimit;
				const result = await client.query<Record<string, unknown>>(prepareReadOnlyQuery(sql, limit));
				const truncated = result.rows.length > limit;
				const rows = result.rows.slice(0, limit).map(normalizeRow);
				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ profile: activeDatabaseProfile, database: options.database, rowCount: rows.length, truncated, rows }, null, 2) }],
					structuredContent: { profile: activeDatabaseProfile, database: options.database, rowCount: rows.length, truncated, rows },
				};
				} finally {
					await client.query('ROLLBACK').catch(() => undefined);
				}
			});
		} catch (error) {
			return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
