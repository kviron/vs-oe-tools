import { queryDatabaseRaw } from './databaseSession';
import { type McpClassProperty } from './classProperties';
import { decodeSourceValue } from './sourceContent';

interface ClassPropertySourceRow extends Record<string, unknown> {
	id: number | string;
	propname: unknown;
	propaliases: unknown;
	ownerclassid: number | string;
	ownerclassname: string | null;
	proponlyread: string | null;
	propvisibility: string | null;
	proppackage: string | null;
	depth: number;
}

export interface PropertyDetailsRow extends Record<string, unknown> {
	data: Record<string, unknown>;
	ownerclassid: number | string;
	ownerclassname: string | null;
	propvisibility: string | null;
	proppackage: string | null;
}

export async function loadClassPropertyRows(classId: number, includeInherited: boolean): Promise<ClassPropertySourceRow[]> {
	return queryDatabaseRaw<ClassPropertySourceRow>(
		`WITH RECURSIVE class_chain AS (
		 SELECT class.id, class.name, class.seniorid, 0 AS depth, ARRAY[class.id] AS path
		 FROM classes AS class WHERE class.id = $1
		 UNION ALL
		 SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
		 FROM classes AS parent JOIN class_chain AS chain ON parent.id = chain.seniorid
		 WHERE NOT parent.id = ANY(chain.path)
		)
		SELECT property.id, property.name AS propname, property.aliases AS propaliases,
		       chain.id AS ownerclassid, chain.name AS ownerclassname,
		       CASE WHEN NULLIF(property.writemember, 0) IS NULL THEN 'Да' END AS proponlyread,
		       visibility.name AS propvisibility, package.packagename AS proppackage, chain.depth
		FROM class_chain AS chain
		JOIN properties AS property ON property.seniorid = chain.id
		LEFT JOIN enum AS visibility ON visibility.classid = 12450282
		 AND ((visibility.id = 12450286 AND (NULLIF(property.visibility, 0) IS NULL OR property.visibility = 12450283))
		   OR (property.visibility <> 12450283 AND visibility.id = property.visibility))
		LEFT JOIN abstract AS abstract_property ON abstract_property.id = property.id
		LEFT JOIN sysfile AS file ON file.id = abstract_property.sysfile
		LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		LEFT JOIN syspackages AS package ON package.id = file_group.package
		WHERE ($2::boolean OR chain.depth = 0)
		ORDER BY chain.depth, lower(property.name), property.id`,
		[classId, includeInherited],
	);
}

export function toMcpClassProperty(row: ClassPropertySourceRow): McpClassProperty {
	return {
		id: String(row.id), name: propertyText(row.propname), aliases: propertyText(row.propaliases),
		ownerClassId: String(row.ownerclassid), ownerClassName: row.ownerclassname ?? '',
		depth: row.depth, inherited: row.depth > 0, type: '', readOnly: row.proponlyread === 'Да',
		visibility: row.propvisibility ?? '', package: row.proppackage ?? '', isBinary: false,
	};
}

export function propertyValue(data: Record<string, unknown>, name: string): unknown {
	const entry = Object.entries(data).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase());
	return entry?.[1];
}

export function isEmptyWriteMember(value: unknown): boolean {
	return value === null || value === undefined || value === 0 || value === '0' || value === '';
}

function propertyText(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (Buffer.isBuffer(value) || (typeof value === 'string' && /^\\x[\da-f]+$/i.test(value))) {
		return decodeSourceValue(value);
	}
	return String(value);
}
