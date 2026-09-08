import { Client } from 'pg';
import { buildSqlCompletionSchema, type SqlCompletionColumnRow, type SqlCompletionSchema } from '../../features/sql-executor/sqlCompletionSchema';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';

const cacheDurationMs = 5 * 60_000;
const cache = new Map<string, { expiresAt: number; value: Promise<SqlCompletionSchema> }>();

export async function getSqlCompletionSchema(): Promise<SqlCompletionSchema> {
	const options = await getProjectDatabaseOptions();
	const cacheKey = `${options.host}:${options.port}/${options.database}/${options.user}`;
	const cached = cache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) { return cached.value; }

	const value = loadSqlCompletionSchema(options);
	cache.set(cacheKey, { expiresAt: Date.now() + cacheDurationMs, value });
	try {
		return await value;
	} catch (error) {
		cache.delete(cacheKey);
		throw error;
	}
}

async function loadSqlCompletionSchema(options: Awaited<ReturnType<typeof getProjectDatabaseOptions>>): Promise<SqlCompletionSchema> {
	const client = new Client({ ...options, application_name: 'vc-ve-tools-sql-completion', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await client.query<SqlCompletionColumnRow>(`
			SELECT table_schema, table_name, column_name
			FROM information_schema.columns
			WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
			ORDER BY table_schema, table_name, ordinal_position
		`);
		return buildSqlCompletionSchema(result.rows);
	} finally {
		await client.end().catch(() => undefined);
	}
}
