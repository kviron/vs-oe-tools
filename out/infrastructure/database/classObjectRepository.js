"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassObjects = getClassObjects;
const pg_1 = require("pg");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
const objectLimit = 500;
async function getClassObjects(classId) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const classResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
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
        const physicalResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
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
        const attributesResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
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
        const usedFields = new Set();
        const columns = [];
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
        const source = `${quoteIdentifier(selectedSchema)}.${quoteIdentifier(selectedTable)}`;
        const classIdColumn = physicalByLowerName.get('classid');
        const where = classIdColumn ? ` WHERE ${quoteIdentifier(classIdColumn)} = $1` : '';
        const values = classIdColumn ? [classId] : [];
        const countResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT COUNT(*)::text AS count FROM ${source}${where}`,
            values,
            source: `Количество объектов класса ${classRow.name}`,
            database: options.database,
        });
        const rowsResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT * FROM ${source}${where} ORDER BY ${quoteIdentifier(idColumn ?? physicalColumns[0].column_name)} LIMIT ${objectLimit + 1}`,
            values,
            source: `Объекты класса ${classRow.name}`,
            database: options.database,
        });
        const normalizedRows = rowsResult.rows.slice(0, objectLimit).map(row => normalizeRow(row, columns));
        return {
            classId,
            className: classRow.name,
            columns,
            rows: normalizedRows,
            totalCount: Number(countResult.rows[0]?.count ?? normalizedRows.length),
            truncated: rowsResult.rows.length > objectLimit,
        };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
function normalizeRow(row, columns) {
    const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), serializableValue(value)]));
    return Object.fromEntries(columns.map(column => [column.key, values.get(column.key.toLowerCase()) ?? null]));
}
function serializableValue(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return `<binary: ${value.byteLength} bytes>`;
    }
    return value;
}
function quoteIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
//# sourceMappingURL=classObjectRepository.js.map