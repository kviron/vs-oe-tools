import { queryDatabaseRaw } from '../database';
import { quotePostgresIdentifier } from './classAttributes';
import { normalizeValue } from '../toolResult';

interface DictionaryClassRow extends Record<string, unknown> {
	id: number | string;
	name: string;
	dbtablename: string | null;
	virtual: number | null;
}

interface DictionaryColumn {
	attributeId: string;
	attributeName: string;
	title: string;
	key: string;
}

interface DictionaryStorage {
	classId: number;
	className: string;
	source: string;
	physicalColumns: string[];
	idColumn?: string;
	classIdColumn?: string;
	classIds: number[];
	columns: DictionaryColumn[];
}

export async function loadClassDictionaryStorage(classId: number): Promise<DictionaryStorage> {
	const classRows = await queryDatabaseRaw<DictionaryClassRow>('SELECT id, name, dbtablename, virtual FROM classes WHERE id = $1', [classId]);
	const selectedClass = classRows[0];
	if (!selectedClass) {
		throw new Error(`Class ${classId} was not found.`);
	}
	if (selectedClass.virtual) {
		throw new Error(`Class ${selectedClass.name} is virtual and has no dictionary storage.`);
	}
	if (!selectedClass.dbtablename?.trim()) {
		throw new Error(`Class ${selectedClass.name} has no database table.`);
	}
	const physicalRows = await queryDatabaseRaw<{ table_schema: string; table_name: string; column_name: string } & Record<string, unknown>>(
		`SELECT table_schema, table_name, column_name FROM information_schema.columns
		 WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND lower(table_name) = lower($1)
		 ORDER BY CASE WHEN table_schema = current_schema() THEN 0 ELSE 1 END, ordinal_position`,
		[selectedClass.dbtablename],
	);
	if (physicalRows.length === 0) {
		throw new Error(`Table ${selectedClass.dbtablename} was not found.`);
	}
	const schema = physicalRows[0].table_schema;
	const table = physicalRows[0].table_name;
	const physicalColumns = physicalRows.filter(row => row.table_schema === schema && row.table_name === table).map(row => row.column_name);
	const physicalByName = new Map(physicalColumns.map(column => [column.toLowerCase(), column]));
	const classTreeRows = await queryDatabaseRaw<Record<string, unknown> & { id: number | string }>(
		`WITH RECURSIVE class_tree AS (
			SELECT id FROM classes WHERE id = $1
			UNION ALL
			SELECT child.id FROM classes child JOIN class_tree parent ON child.seniorid = parent.id
		)
		SELECT id FROM class_tree`,
		[classId],
	);
	const classIds = classTreeRows.map(row => Number(row.id)).filter(Number.isSafeInteger);
	const attributeRows = await queryDatabaseRaw<{ id: number | string; name: string; title: string | null; dbfieldname: string } & Record<string, unknown>>(
		`WITH RECURSIVE class_chain AS (
		 SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
		 UNION ALL SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
		 FROM classes parent JOIN class_chain chain ON chain.seniorid = parent.id WHERE NOT parent.id = ANY(chain.path)
		)
		SELECT attribute.id, attribute.name, attribute.title, attribute.dbfieldname
		FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
		WHERE COALESCE(attribute.dbfieldname, '') <> '' AND COALESCE(attribute.static, 0) = 0
		ORDER BY chain.depth, attribute.ord NULLS LAST, attribute.id`,
		[classId],
	);
	const used = new Set<string>();
	const columns: DictionaryColumn[] = [];
	for (const attributeRow of attributeRows) {
		const key = physicalByName.get(attributeRow.dbfieldname.toLowerCase());
		if (!key || used.has(key.toLowerCase())) {
			continue;
		}
		used.add(key.toLowerCase());
		columns.push({ attributeId: String(attributeRow.id), attributeName: attributeRow.name, title: attributeRow.title?.trim() || attributeRow.name, key });
	}
	const idColumn = physicalByName.get('id');
	if (idColumn && !used.has(idColumn.toLowerCase())) {
		columns.unshift({ attributeId: '', attributeName: '_Ид', title: '_Ид', key: idColumn });
	}
	if (columns.length === 0) {
		throw new Error(`Class ${selectedClass.name} has no mapped stored attributes.`);
	}
	return {
		classId,
		className: selectedClass.name,
		source: `${quotePostgresIdentifier(schema)}.${quotePostgresIdentifier(table)}`,
		physicalColumns,
		idColumn,
		classIdColumn: physicalByName.get('classid'),
		classIds,
		columns,
	};
}

export function dictionaryResult(storage: DictionaryStorage, rows: Record<string, unknown>[], offset: number, limit: number, totalCount: number): Record<string, unknown> {
	const normalizedRows = rows.map(row => {
		const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), normalizeValue(value)]));
		return Object.fromEntries(storage.columns.map(column => [column.key, values.get(column.key.toLowerCase()) ?? null]));
	});
	return {
		classId: String(storage.classId), className: storage.className, columns: storage.columns,
		offset, limit, count: normalizedRows.length, totalCount,
		hasMore: offset + normalizedRows.length < totalCount, rows: normalizedRows,
	};
}
