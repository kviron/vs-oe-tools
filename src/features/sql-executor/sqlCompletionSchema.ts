export interface SqlCompletionSchema {
	schema: Record<string, Record<string, string[]>>;
	defaultSchema?: string;
}

export interface SqlCompletionColumnRow {
	table_schema: string;
	table_name: string;
	column_name: string;
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

export interface SqlAliasCompletion {
	from: number;
	table: string;
	columns: string[];
}

export function completeAliasColumns(document: string, position: number, completion: SqlCompletionSchema): SqlAliasCompletion | undefined {
	const qualified = document.slice(0, position).match(/[\p{L}_][\p{L}\p{N}_$]*\.[\p{L}\p{N}_$]*$/u)?.[0];
	if (!qualified) { return undefined; }
	const dot = qualified.indexOf('.');
	const qualifier = qualified.slice(0, dot).toLocaleLowerCase('en-US');
	const statementStart = document.lastIndexOf(';', position - 1) + 1;
	const nextSemicolon = document.indexOf(';', position);
	const statement = document.slice(statementStart, nextSemicolon < 0 ? document.length : nextSemicolon);
	const reference = findTableReference(statement, qualifier, completion);
	if (!reference) { return undefined; }
	return { from: position - qualified.length + dot + 1, ...reference };
}

const aliasStopWords = new Set(['where', 'join', 'inner', 'left', 'right', 'full', 'cross', 'on', 'group', 'order', 'having', 'limit', 'offset', 'union']);

function findTableReference(
	statement: string,
	qualifier: string,
	completion: SqlCompletionSchema,
): { table: string; columns: string[] } | undefined {
	const identifier = '(?:"[^"]+"|[\\p{L}_][\\p{L}\\p{N}_$]*)';
	const pattern = new RegExp(`\\b(?:from|join)\\s+(${identifier}(?:\\s*\\.\\s*${identifier})?)(?:\\s+(?:as\\s+)?(${identifier}))?`, 'giu');
	for (const match of statement.matchAll(pattern)) {
		const path = match[1].split('.').map(part => normalizeIdentifier(part));
		const table = path.at(-1);
		if (!table) { continue; }
		const possibleAlias = match[2] ? normalizeIdentifier(match[2]) : undefined;
		const alias = possibleAlias && !aliasStopWords.has(possibleAlias.toLocaleLowerCase('en-US')) ? possibleAlias : table;
		if (alias.toLocaleLowerCase('en-US') !== qualifier && table.toLocaleLowerCase('en-US') !== qualifier) { continue; }
		const schema = path.length > 1 ? path[0] : completion.defaultSchema;
		const columns = findTableColumns(completion, schema, table);
		if (columns) { return { table, columns }; }
	}
	return undefined;
}

function findTableColumns(completion: SqlCompletionSchema, schemaName: string | undefined, tableName: string): string[] | undefined {
	const schemaEntry = Object.entries(completion.schema).find(([name]) => !schemaName || name.localeCompare(schemaName, 'en', { sensitivity: 'base' }) === 0);
	return Object.entries(schemaEntry?.[1] ?? {}).find(([name]) => name.localeCompare(tableName, 'en', { sensitivity: 'base' }) === 0)?.[1];
}

function normalizeIdentifier(value: string): string {
	return value.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
}
