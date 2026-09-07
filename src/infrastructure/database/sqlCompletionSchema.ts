import { Client } from 'pg';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';

export interface SqlCompletionSchema {
	schema: Record<string, Record<string, string[]>>;
	defaultSchema?: string;
}

export interface SqlCompletionColumnRow {
	table_schema: string;
	table_name: string;
	column_name: string;
}

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

export function buildSqlCompletionSchema(rows: readonly SqlCompletionColumnRow[]): SqlCompletionSchema {
	const schemas = new Map<string, Map<string, string[]>>();
	for (const row of rows) {
		let tables = schemas.get(row.table_schema);
		if (!tables) {
			tables = new Map<string, string[]>();
			schemas.set(row.table_schema, tables);
		}
		let columns = tables.get(row.table_name);
		if (!columns) {
			columns = [];
			tables.set(row.table_name, columns);
		}
		columns.push(row.column_name);
	}
	const schema = Object.fromEntries(
		Array.from(schemas, ([schemaName, tables]) => [schemaName, Object.fromEntries(tables)]),
	);
	return {
		schema,
		defaultSchema: schemas.has('public') ? 'public' : schemas.keys().next().value,
	};
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
