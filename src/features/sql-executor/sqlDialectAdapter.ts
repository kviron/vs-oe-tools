import type { Client } from 'pg';

interface TableReference {
	tableName: string;
	alias: string;
}

const sqlKeywords = new Set([
	'where', 'left', 'right', 'inner', 'full', 'cross', 'join', 'on', 'order', 'group',
	'having', 'limit', 'offset', 'union', 'except', 'intersect', 'returning',
]);

export async function adaptVeSqlToPostgres(client: Client, source: string): Promise<string> {
	const references = extractTableReferences(source);
	if (references.length === 0) {
		return source;
	}
	const tableNames = [...new Set(references.map(reference => reference.tableName.toLowerCase()))];
	const result = await client.query<{ table_name: string; column_name: string }>(
		`SELECT table_name, column_name
		 FROM information_schema.columns
		 WHERE table_schema = ANY(current_schemas(false))
		   AND lower(table_name) = ANY($1::text[])`,
		[tableNames],
	);
	const columnsByTable = new Map<string, Set<string>>();
	for (const row of result.rows) {
		const columns = columnsByTable.get(row.table_name.toLowerCase()) ?? new Set<string>();
		columns.add(row.column_name.toLowerCase());
		columnsByTable.set(row.table_name.toLowerCase(), columns);
	}
	const columnsByAlias = new Map<string, Set<string>>();
	for (const reference of references) {
		const columns = columnsByTable.get(reference.tableName.toLowerCase());
		if (columns) {
			columnsByAlias.set(reference.alias.toLowerCase(), columns);
		}
	}
	return mapExecutableSql(source, part => replaceCompositeDateTimeFields(part, columnsByAlias));
}

export function adaptCompositeDateTimeFields(source: string, columnsByAlias: ReadonlyMap<string, ReadonlySet<string>>): string {
	return mapExecutableSql(source, part => replaceCompositeDateTimeFields(part, columnsByAlias));
}

function extractTableReferences(source: string): TableReference[] {
	const executableSql = mapExecutableSql(source, part => part, ' ');
	const references: TableReference[] = [];
	const pattern = /\b(?:from|join)\s+(?:([a-z_][\w$]*)\s*\.\s*)?([a-z_][\w$]*)(?:\s+(?:as\s+)?([a-z_][\w$]*))?/gi;
	for (const match of executableSql.matchAll(pattern)) {
		const tableName = match[2];
		const possibleAlias = match[3];
		const alias = possibleAlias && !sqlKeywords.has(possibleAlias.toLowerCase()) ? possibleAlias : tableName;
		references.push({ tableName, alias });
	}
	return references;
}

function replaceCompositeDateTimeFields(part: string, columnsByAlias: ReadonlyMap<string, ReadonlySet<string>>): string {
	return part.replace(/\b([a-z_][\w$]*)\s*\.\s*([a-z_][\w$]*)\b/gi, (reference, alias: string, field: string) => {
		const columns = columnsByAlias.get(alias.toLowerCase());
		const normalizedField = field.toLowerCase();
		if (!columns
			|| columns.has(normalizedField)
			|| !columns.has(`${normalizedField}_date`)
			|| !columns.has(`${normalizedField}_tz`)
			|| !columns.has('timezone')) {
			return reference;
		}
		return `COALESCE(timezone(${alias}.timezone, ${alias}.${field}_tz), ${alias}.${field}_date)`;
	});
}

function mapExecutableSql(source: string, transform: (part: string) => string, protectedReplacement?: string): string {
	const protectedSql = /(--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*")/g;
	let output = '';
	let position = 0;
	for (const match of source.matchAll(protectedSql)) {
		const index = match.index ?? 0;
		output += transform(source.slice(position, index));
		output += protectedReplacement ?? match[0];
		position = index + match[0].length;
	}
	return output + transform(source.slice(position));
}
