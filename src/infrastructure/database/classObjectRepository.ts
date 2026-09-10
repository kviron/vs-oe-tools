import type { ClassObjectColumn, ClassObjectsResult } from '../../features/classes/models';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

interface ClassStorageRow {
	id: number;
	name: string;
	dbtablename: string | null;
	virtual: number | null;
}

interface AttributeStorageRow {
	id: string;
	name: string;
	title: string | null;
	dbfieldname: string;
	attrtype: number | null;
}

interface PhysicalColumnRow {
	table_schema: string;
	table_name: string;
	column_name: string;
}

export const classObjectPageSize = 100;

export async function getClassObjects(classId: number, offset = 0, limit = classObjectPageSize, targetObjectId?: number): Promise<ClassObjectsResult> {
	if (!Number.isInteger(offset) || offset < 0) {
		throw new Error('Смещение страницы справочника должно быть целым неотрицательным числом.');
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > classObjectPageSize) {
		throw new Error(`Размер страницы справочника должен быть от 1 до ${classObjectPageSize}.`);
	}
	return withProjectDatabaseSession(async ({ client, options }) => {
		const classResult = await executeMonitoredQuery<ClassStorageRow, [number]>(client, {
			text: 'SELECT id, name, dbtablename, virtual FROM classes WHERE id = $1',
			values: [classId],
			source: `Хранилище объектов класса ${classId}`,
			database: options.database,
		});
		const classRow = classResult.rows[0];
		if (!classRow) {
			throw new Error(`Класс ${classId} не найден.`);
		}
		if (classRow.virtual) {
			throw new Error(`Класс ${classRow.name} является виртуальным и не имеет собственного списка объектов.`);
		}
		if (!classRow.dbtablename?.trim()) {
			throw new Error(`Для класса ${classRow.name} не задана таблица хранения.`);
		}

		const physicalResult = await executeMonitoredQuery<PhysicalColumnRow, [string]>(client, {
			text: `SELECT table_schema, table_name, column_name
			 FROM information_schema.columns
			 WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND lower(table_name) = lower($1)
			 ORDER BY CASE WHEN table_schema = current_schema() THEN 0 ELSE 1 END, ordinal_position`,
			values: [classRow.dbtablename],
			source: `Поля таблицы ${classRow.dbtablename}`,
			database: options.database,
		});
		if (!physicalResult.rows.length) {
			throw new Error(`Таблица ${classRow.dbtablename} не найдена в базе данных.`);
		}
		const selectedSchema = physicalResult.rows[0].table_schema;
		const selectedTable = physicalResult.rows[0].table_name;
		const physicalColumns = physicalResult.rows.filter(row => row.table_schema === selectedSchema && row.table_name === selectedTable);
		const physicalByLowerName = new Map(physicalColumns.map(row => [row.column_name.toLowerCase(), row.column_name]));

		const attributesResult = await executeMonitoredQuery<AttributeStorageRow, [number]>(client, {
			text: `WITH RECURSIVE class_chain AS (
			   SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
			   UNION ALL
			   SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
			   FROM classes parent JOIN class_chain chain ON chain.seniorid = parent.id
			   WHERE NOT parent.id = ANY(chain.path)
			 )
			 SELECT attribute.id::text, attribute.name, attribute.title, attribute.dbfieldname, attribute.attrtype
			 FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
			 WHERE COALESCE(attribute.dbfieldname, '') <> '' AND COALESCE(attribute.static, 0) = 0
			 ORDER BY chain.depth, attribute.ord NULLS LAST, attribute.id`,
			values: [classId],
			source: `Колонки списка объектов класса ${classRow.name}`,
			database: options.database,
		});

		const usedFields = new Set<string>();
		const columns: ClassObjectColumn[] = [];
		for (const attribute of attributesResult.rows) {
			const physicalName = physicalByLowerName.get(attribute.dbfieldname.toLowerCase());
			if (!physicalName || usedFields.has(physicalName.toLowerCase())) {
				continue;
			}
			usedFields.add(physicalName.toLowerCase());
			columns.push({
				attributeId: attribute.id,
				key: physicalName,
				title: attribute.title?.trim() || attribute.name,
				attributeName: attribute.name,
				reference: attribute.attrtype === 333,
			});
		}

		const idColumn = physicalByLowerName.get('id');
		if (idColumn && !usedFields.has(idColumn.toLowerCase())) {
			columns.unshift({ attributeId: '', key: idColumn, title: '_Ид', attributeName: '_Ид', reference: false });
		}
		if (idColumn) {
			columns.push({ attributeId: '', key: '__package', title: 'Пакет', attributeName: 'Пакет', reference: false });
		}
		const source = `${quoteIdentifier(selectedSchema)}.${quoteIdentifier(selectedTable)}`;
		const classIdColumn = physicalByLowerName.get('classid');
		const where = classIdColumn ? ` WHERE object_table.${quoteIdentifier(classIdColumn)} = $1` : '';
		const values = classIdColumn ? [classId] : [];
		let effectiveOffset = offset;
		if (targetObjectId !== undefined && idColumn) {
			if (!Number.isSafeInteger(targetObjectId) || targetObjectId <= 0) {
				throw new Error('ID выделяемого элемента справочника должен быть положительным целым числом.');
			}
			const targetParameter = values.length + 1;
			const positionResult = await executeMonitoredQuery<{ position: string; found: boolean }>(client, {
				text: `SELECT COUNT(*) FILTER (WHERE object_table.${quoteIdentifier(idColumn)} < $${targetParameter})::text AS position,
				 BOOL_OR(object_table.${quoteIdentifier(idColumn)} = $${targetParameter}) AS found
				 FROM ${source} AS object_table${where}`,
				values: [...values, targetObjectId],
				source: `Позиция объекта ${targetObjectId} в классе ${classRow.name}`,
				database: options.database,
			});
			const position = Number(positionResult.rows[0]?.position ?? 0);
			if (positionResult.rows[0]?.found && Number.isSafeInteger(position) && position >= 0) {
				effectiveOffset = Math.floor(position / limit) * limit;
			}
		}
		const countResult = await executeMonitoredQuery<{ count: string }>(client, {
			text: `SELECT COUNT(*)::text AS count FROM ${source} AS object_table${where}`,
			values,
			source: `Количество объектов класса ${classRow.name}`,
			database: options.database,
		});
		const rowsResult = await executeMonitoredQuery<Record<string, unknown>>(client, {
			text: `SELECT object_table.*${idColumn ? ', package.packagename AS __package' : ''}
			 FROM ${source} AS object_table
			 ${idColumn ? `LEFT JOIN abstract AS abstract_object ON abstract_object.id = object_table.${quoteIdentifier(idColumn)}
			 LEFT JOIN sysfile AS file ON file.id = abstract_object.sysfile
			 LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			 LEFT JOIN syspackages AS package ON package.id = file_group.package` : ''}
			 ${where}
			 ORDER BY object_table.${quoteIdentifier(idColumn ?? physicalColumns[0].column_name)}
			 LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
			values: [...values, limit, effectiveOffset],
			source: `Объекты класса ${classRow.name}`,
			database: options.database,
		});
		const normalizedRows = rowsResult.rows.map(row => normalizeRow(row, columns));
		const totalCount = Number(countResult.rows[0]?.count ?? normalizedRows.length);
		return {
			classId,
			className: classRow.name,
			columns,
			rows: normalizedRows,
			totalCount,
			offset: effectiveOffset,
			limit,
			hasMore: effectiveOffset + normalizedRows.length < totalCount,
		};
	});
}

function normalizeRow(row: Record<string, unknown>, columns: ClassObjectColumn[]): Record<string, unknown> {
	const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), serializableValue(value)]));
	return Object.fromEntries(columns.map(column => [column.key, values.get(column.key.toLowerCase()) ?? null]));
}

function serializableValue(value: unknown): unknown {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Buffer.isBuffer(value)) {
		return `<binary: ${value.byteLength} bytes>`;
	}
	return value;
}

function quoteIdentifier(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}
