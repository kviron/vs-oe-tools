import { createSourceExcerpt, decodeSourceValue } from './sourceContent';

export interface DfmSourceRow extends Record<string, unknown> {
	classid: number | string;
	classname: string;
	attrid: number | string;
	valueid: number | string;
	valuename: string | null;
	defvalue: unknown;
	valuetype: string;
}

export const dfmSourceQuery = `WITH RECURSIVE class_chain AS (
	SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
	UNION ALL
	SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
	FROM classes parent JOIN class_chain chain ON parent.id = chain.seniorid
	WHERE NOT parent.id = ANY(chain.path)
), dfm_attribute AS (
	SELECT attribute.id, chain.depth
	FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
	WHERE upper(attribute.name) = 'DFM'
	ORDER BY chain.depth LIMIT 1
)
SELECT class.id AS classid, class.name AS classname, attribute.id AS attrid,
	value.id AS valueid, value.name AS valuename, value.defvalue,
	pg_typeof(value.defvalue)::text AS valuetype
FROM classes class CROSS JOIN dfm_attribute attribute
JOIN dfltvalues value ON value.seniorid = class.id AND value.attrid = attribute.id
WHERE class.id = $1`;

export const dfmInheritanceQuery = `WITH RECURSIVE class_chain AS (
	SELECT id, name, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
	UNION ALL
	SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
	FROM classes parent JOIN class_chain chain ON parent.id = chain.seniorid
	WHERE NOT parent.id = ANY(chain.path)
), dfm_attributes AS (
	SELECT attribute.id FROM class_chain chain
	JOIN attributes attribute ON attribute.seniorid = chain.id
	WHERE upper(attribute.name) = 'DFM'
)
SELECT chain.id AS classid, chain.name AS classname, value.attrid,
	value.id AS valueid, value.name AS valuename, value.defvalue,
	pg_typeof(value.defvalue)::text AS valuetype, chain.depth
FROM class_chain chain
JOIN dfltvalues value ON value.seniorid = chain.id
WHERE value.attrid IN (SELECT id FROM dfm_attributes)
ORDER BY chain.depth DESC`;

export function formatDfmSource(row: DfmSourceRow, startLine?: number, maxLines?: number): Record<string, unknown> {
	return {
		classId: String(row.classid),
		className: row.classname,
		attributeId: String(row.attrid),
		valueId: String(row.valueid),
		valueName: row.valuename ?? 'DFM',
		valueType: row.valuetype,
		source: createSourceExcerpt(decodeSourceValue(row.defvalue), startLine, maxLines),
	};
}
