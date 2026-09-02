"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adaptVeSqlToPostgres = adaptVeSqlToPostgres;
exports.adaptCompositeDateTimeFields = adaptCompositeDateTimeFields;
const sqlKeywords = new Set([
    'where', 'left', 'right', 'inner', 'full', 'cross', 'join', 'on', 'order', 'group',
    'having', 'limit', 'offset', 'union', 'except', 'intersect', 'returning',
]);
async function adaptVeSqlToPostgres(client, source) {
    const references = extractTableReferences(source);
    if (references.length === 0) {
        return source;
    }
    const tableNames = [...new Set(references.map(reference => reference.tableName.toLowerCase()))];
    const result = await client.query(`SELECT table_name, column_name
		 FROM information_schema.columns
		 WHERE table_schema = ANY(current_schemas(false))
		   AND lower(table_name) = ANY($1::text[])`, [tableNames]);
    const columnsByTable = new Map();
    for (const row of result.rows) {
        const columns = columnsByTable.get(row.table_name.toLowerCase()) ?? new Set();
        columns.add(row.column_name.toLowerCase());
        columnsByTable.set(row.table_name.toLowerCase(), columns);
    }
    const columnsByAlias = new Map();
    for (const reference of references) {
        const columns = columnsByTable.get(reference.tableName.toLowerCase());
        if (columns) {
            columnsByAlias.set(reference.alias.toLowerCase(), columns);
        }
    }
    return mapExecutableSql(source, part => replaceCompositeDateTimeFields(part, columnsByAlias));
}
function adaptCompositeDateTimeFields(source, columnsByAlias) {
    return mapExecutableSql(source, part => replaceCompositeDateTimeFields(part, columnsByAlias));
}
function extractTableReferences(source) {
    const executableSql = mapExecutableSql(source, part => part, ' ');
    const references = [];
    const pattern = /\b(?:from|join)\s+(?:([a-z_][\w$]*)\s*\.\s*)?([a-z_][\w$]*)(?:\s+(?:as\s+)?([a-z_][\w$]*))?/gi;
    for (const match of executableSql.matchAll(pattern)) {
        const tableName = match[2];
        const possibleAlias = match[3];
        const alias = possibleAlias && !sqlKeywords.has(possibleAlias.toLowerCase()) ? possibleAlias : tableName;
        references.push({ tableName, alias });
    }
    return references;
}
function replaceCompositeDateTimeFields(part, columnsByAlias) {
    return part.replace(/\b([a-z_][\w$]*)\s*\.\s*([a-z_][\w$]*)\b/gi, (reference, alias, field) => {
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
function mapExecutableSql(source, transform, protectedReplacement) {
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
//# sourceMappingURL=sqlDialectAdapter.js.map