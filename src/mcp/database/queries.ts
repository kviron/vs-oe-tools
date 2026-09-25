import { normalizeRow } from '../toolResult';
import { withMcpDatabaseSession } from './context';

export async function queryDatabase(text: string, values: unknown[]): Promise<Record<string, unknown>[]> {
	return (await queryDatabaseRaw<Record<string, unknown>>(text, values)).map(normalizeRow);
}

export async function queryDatabaseRaw<Row extends Record<string, unknown>>(text: string, values: unknown[]): Promise<Row[]> {
	return withMcpDatabaseSession(async ({ client }) => {
		try {
			await client.query('BEGIN READ ONLY');
			await client.query("SET LOCAL statement_timeout = '10s'");
			await client.query("SET LOCAL lock_timeout = '2s'");
			const result = await client.query<Row>(text, values);
			return result.rows;
		} finally {
			await client.query('ROLLBACK').catch(() => undefined);
		}
	});
}
