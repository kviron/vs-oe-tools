import { createHash, randomUUID } from 'node:crypto';
import type { QueryResult } from 'pg';
import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import { activeDatabaseProfile, withMcpDatabaseSession } from '../../database';
import { normalizeRow } from '../../toolResult';
import type { McpToolServer } from '../../toolTypes';

interface Proposal { sql: string; profile: string | undefined; database: string; host: string; port: number; expires: number; outsideTransaction: boolean }
const proposals = new Map<string, Proposal>();

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
		description: 'Run any single PostgreSQL statement. Read-only statements execute immediately without row or time limits. Mutations return the exact SQL for user approval; call again with approvalToken only after the user approves. A VS Code modal then confirms the exact SQL before execution.',
		inputSchema: {
			sql: z.string().min(1).describe('Exact PostgreSQL statement to run'),
			approvalToken: z.string().optional().describe('Token returned for a mutation proposal; use only after explicit user approval'),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async ({ sql, approvalToken }: { sql: string; approvalToken?: string }) => {
		try {
			if (!sql.trim()) { throw new Error('SQL must not be empty.'); }
			return await withMcpDatabaseSession(async ({ client, options }) => {
				const database = (await client.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database;
				if (!database || database !== options.database) { throw new Error('The connected database differs from the active profile.'); }
				if (approvalToken) {
					const proposal = proposals.get(approvalToken);
					proposals.delete(approvalToken);
					if (!proposal || proposal.expires < Date.now() || proposal.sql !== sql || proposal.profile !== activeDatabaseProfile
						|| proposal.database !== database || proposal.host !== options.host || proposal.port !== options.port) {
						throw new Error('SQL approval token is expired or does not match the exact statement and active database. Request a new proposal.');
					}
					const confirmation = await bridgeToolResult({ action: 'confirm_sql_mutation', sql, database }, 300_000);
					if (confirmation.isError) { throw new Error(confirmation.content[0]?.type === 'text' ? confirmation.content[0].text : 'VS Code confirmation failed.'); }
					if (confirmation.structuredContent?.approved !== true) { throw new Error('SQL mutation was not approved in VS Code.'); }
					if (proposal.outsideTransaction) {
						const result = await client.query(preparedSql(sql));
						const output = { profile: activeDatabaseProfile, database, executed: true, ...queryResult(result) };
						return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
					}
					try {
						await client.query('BEGIN');
						const result = await client.query(preparedSql(sql));
						await client.query('COMMIT');
						const output = { profile: activeDatabaseProfile, database, executed: true, ...queryResult(result) };
						return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
					} catch (error) {
						await client.query('ROLLBACK').catch(() => undefined);
						throw error;
					}
				}
				try {
					await client.query('BEGIN READ ONLY');
					const result = await client.query(preparedSql(sql));
					const output = { profile: activeDatabaseProfile, database, executed: true, ...queryResult(result) };
					return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
				} catch (error) {
					const errorCode = (error as { code?: string }).code;
					if (errorCode !== '25006' && errorCode !== '25001' && errorCode !== '2D000') { throw error; }
					const token = randomUUID();
					proposals.set(token, { sql, profile: activeDatabaseProfile, database, host: options.host, port: options.port,
						expires: Date.now() + 600_000, outsideTransaction: errorCode !== '25006' });
					const output = { profile: activeDatabaseProfile, database, executed: false, requiresApproval: true, sql, approvalToken: token };
					return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], structuredContent: output };
				} finally {
					await client.query('ROLLBACK').catch(() => undefined);
				}
			});
		} catch (error) {
			return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
