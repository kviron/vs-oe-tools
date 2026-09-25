import { quotePostgresIdentifier, type McpClassAttribute, readAttributeValue } from './classAttributes';
import { decodeSourceValue } from './sourceContent';
import { normalizeValue } from '../toolResult';
import { sql } from '../database';

export interface AttributeTableRow extends Record<string, unknown> {
	table_schema: string;
	table_name: string;
	columns: string[];
}

export interface ClassAttributeSourceRow extends Record<string, unknown> {
	data: Record<string, unknown>;
	ownerclassid: number | string;
	ownerclassname: string;
	depth: number;
}

export const attributeTableDiscoveryQuery = sql`SELECT table_schema, table_name, array_agg(lower(column_name)) AS columns
	FROM information_schema.columns
	WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
	GROUP BY table_schema, table_name
	HAVING lower(table_name) LIKE '%attr%'
	   AND bool_or(lower(column_name) = 'id')
	   AND bool_or(lower(column_name) = 'name')
	   AND bool_or(lower(column_name) IN ('seniorid', 'classid', 'ownerid'))
	ORDER BY CASE lower(table_name)
	  WHEN 'attributes' THEN 0 WHEN 'classattributes' THEN 1 WHEN 'objattributes' THEN 2 ELSE 3 END,
	  table_name`;

export function createClassAttributesQuery(tableName: string, ownerColumn: string, orderColumn: string, includeInherited: boolean): string {
	const owner = quotePostgresIdentifier(ownerColumn);
	const order = quotePostgresIdentifier(orderColumn);
	if (!includeInherited) {
		return `SELECT to_jsonb(attribute) AS data, class.id AS ownerclassid, class.name AS ownerclassname, 0 AS depth
			FROM ${tableName} AS attribute
			JOIN classes AS class ON class.id = attribute.${owner}
			WHERE attribute.${owner} = $1
			ORDER BY attribute.${order} NULLS LAST, attribute.id`;
	}
	return `WITH RECURSIVE class_chain AS (
		SELECT class.id, class.seniorid, class.name, 0 AS depth, ARRAY[class.id] AS path
		FROM classes AS class WHERE class.id = $1
		UNION ALL
		SELECT parent.id, parent.seniorid, parent.name, chain.depth + 1, chain.path || parent.id
		FROM classes AS parent JOIN class_chain AS chain ON parent.id = chain.seniorid
		WHERE NOT parent.id = ANY(chain.path)
	)
	SELECT to_jsonb(attribute) AS data, chain.id AS ownerclassid, chain.name AS ownerclassname, chain.depth
	FROM class_chain AS chain
	JOIN ${tableName} AS attribute ON attribute.${owner} = chain.id
	ORDER BY chain.depth, attribute.${order} NULLS LAST, attribute.id`;
}

export function toMcpClassAttribute(row: ClassAttributeSourceRow): McpClassAttribute {
	return {
		id: readAttributeValue(row.data, 'id'),
		name: readAttributeValue(row.data, 'name'),
		ownerClassId: String(row.ownerclassid),
		ownerClassName: row.ownerclassname,
		depth: row.depth,
		inherited: row.depth > 0,
		type: readAttributeValue(row.data, 'type', 'typename', 'attrtype', 'attributetype', 'kind'),
		dbFieldName: readAttributeValue(row.data, 'dbfieldname', 'dbfield', 'fieldname', 'columnname'),
		data: normalizeAttributeRecord(row.data),
	};
}

export function normalizeAttributeRecord(data: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(data).map(([key, value]) => [
		key,
		typeof value === 'string' && /^\\x[\da-f]+$/i.test(value) ? decodeSourceValue(value) : normalizeValue(value),
	]));
}
