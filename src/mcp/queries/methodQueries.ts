import { queryDatabaseRaw } from '../database';
import { type AttributeTableRow, attributeTableDiscoveryQuery } from './attributeQueries';
import { quotePostgresIdentifier } from './classAttributes';

export async function loadClassChain(rootIds: Array<number | string>): Promise<ClassChainRow[]> {
	if (rootIds.length === 0) {
		return [];
	}
	return queryDatabaseRaw<ClassChainRow>(
		`WITH RECURSIVE class_chain AS (
		  SELECT class.id, class.name, class.seniorid, 0 AS depth, ARRAY[class.id] AS path
		  FROM classes AS class WHERE class.id = ANY($1::bigint[])
		  UNION ALL
		  SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
		  FROM classes AS parent JOIN class_chain AS chain ON parent.id = chain.seniorid
		  WHERE NOT parent.id = ANY(chain.path)
		)
		SELECT id, name, min(depth)::integer AS depth
		FROM class_chain GROUP BY id, name ORDER BY min(depth), name`,
		[rootIds],
	);
}

export async function resolveQualifierClassIds(qualifier: string, callerClassIds: Array<number | string>): Promise<Array<number | string>> {
	const normalized = qualifier.trim();
	const direct = await queryDatabaseRaw<{ id: number | string } & Record<string, unknown>>(
		`SELECT id FROM classes
		 WHERE lower(name) = lower($1)
		    OR COALESCE(aliases::text, '') ILIKE $2
		 ORDER BY CASE WHEN lower(name) = lower($1) THEN 0 ELSE 1 END, id
		 LIMIT 20`,
		[normalized, `%${normalized}%`],
	);
	if (direct.length > 0) {
		return [...new Set(direct.map(row => row.id))];
	}
	const tables = await queryDatabaseRaw<AttributeTableRow>(attributeTableDiscoveryQuery, []);
	const table = tables[0];
	if (!table || !table.columns.includes('attrtype')) {
		return [];
	}
	const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
	if (!ownerColumn) {
		return [];
	}
	const tableName = `${quotePostgresIdentifier(table.table_schema)}.${quotePostgresIdentifier(table.table_name)}`;
	const attributeTypes = await queryDatabaseRaw<{ classid: number | string } & Record<string, unknown>>(
		`SELECT DISTINCT attribute.attrtype AS classid
		 FROM ${tableName} AS attribute
		 WHERE attribute.${quotePostgresIdentifier(ownerColumn)} = ANY($1::bigint[])
		   AND lower(attribute.name) = lower($2)
		   AND attribute.attrtype IS NOT NULL
		 LIMIT 20`,
		[callerClassIds, normalized],
	);
	return [...new Set(attributeTypes.map(row => row.classid))];
}

export interface CallerMethodRow extends Record<string, unknown> {
	id: number | string;
	name: string;
	classid: number | string;
	classname: string | null;
}

export interface MethodCandidateRow extends CallerMethodRow {
	data: Record<string, unknown>;
}

interface ClassChainRow extends Record<string, unknown> {
	id: number | string;
	name: string;
	depth: number;
}

export interface MethodSourceRow extends Record<string, unknown> {
	id: number | string;
	name: string;
	classid: number | string;
	classname: string | null;
	methtype: number | null;
	signature: unknown;
	code: unknown;
	codetype: string;
}
