import { createHash } from 'node:crypto';
import type { QueryResult } from 'pg';
import { z } from '../../schemas';
import { activeDatabaseProfile, withMcpDatabaseSession } from '../../database';
import { normalizeRow } from '../../toolResult';
import type { McpToolServer } from '../../toolTypes';

function queryResult(result: QueryResult | QueryResult[]): Record<string, unknown> {
	const statements = Array.isArray(result) ? result : [result];
	return { statements: statements.map(item => ({ command: item.command, rowCount: item.rowCount,
		rows: item.rows.map(normalizeRow) })) };
}

function preparedSql(sql: string) {
	// A named prepared statement forces PostgreSQL's single-statement protocol.
	return { name: `vc_ve_mcp_sql_${createHash('sha256').update(sql).digest('hex').slice(0, 32)}`, text: sql };
}

export function registerTool(server: McpToolServer): void {
	server.registerTool('query_database', {
		description: 'Run any single PostgreSQL statement against the active database without an approval prompt.',
		inputSchema: { sql: z.string().min(1).describe('Exact PostgreSQL statement to run') },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async ({ sql }: { sql: string }) => {
		try {
			if (!sql.trim()) { throw new Error('SQL must not be empty.'); }
			return await withMcpDatabaseSession(async ({ client, options }) => {
				const database = (await client.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database;
				if (!database || database !== options.database) { throw new Error('The connected database differs from the active profile.'); }
				const result = await client.query(preparedSql(sql));
				const output = { profile: activeDatabaseProfile, database, executed: true, ...queryResult(result) };
				return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
			});
		} catch (error) {
			return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
