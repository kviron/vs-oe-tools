"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDatabaseConnection = testDatabaseConnection;
exports.loadClasses = loadClasses;
exports.getClassDetails = getClassDetails;
exports.getClassAttributes = getClassAttributes;
exports.getClassMethods = getClassMethods;
const pg_1 = require("pg");
const iconv = __importStar(require("iconv-lite"));
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
async function testDatabaseConnection() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({
        ...options,
        application_name: 'vc-ve-tools',
        connectionTimeoutMillis: 5000,
    });
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT current_database() AS database, current_user AS user',
            source: 'Проверка подключения',
            database: options.database,
        });
        const row = result.rows[0];
        if (!row) {
            throw new Error('База не вернула результат проверки.');
        }
        return row;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function loadClasses() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({
        ...options,
        application_name: 'vc-ve-tools',
        connectionTimeoutMillis: 5000,
    });
    try {
        await client.connect();
        const classesResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT id, name, seniorid, ord
			 FROM classes
			 ORDER BY ord NULLS LAST, name`,
            source: 'Загрузка классов',
            database: options.database,
        });
        const commentsResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT comments.id, comments.name, comments.seniorid, comments.ord
			 FROM objcomments AS comments
			 INNER JOIN classes ON classes.id = comments.seniorid
			 ORDER BY comments.ord NULLS LAST, comments.name`,
            source: 'Загрузка комментариев классов',
            database: options.database,
        });
        const metaDataCountsResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT map.seniorid, COUNT(map.id) AS count
			 FROM objectmetadatamap AS map
			 INNER JOIN classes ON classes.id = map.seniorid
			 WHERE map.metaobjectclassid = 5
			 GROUP BY map.seniorid`,
            source: 'Подсчёт метаданных классов',
            database: options.database,
        });
        const commentsBySeniorId = new Map();
        for (const comment of commentsResult.rows) {
            const comments = commentsBySeniorId.get(comment.seniorid) ?? [];
            comments.push(comment);
            commentsBySeniorId.set(comment.seniorid, comments);
        }
        const metaDataCountBySeniorId = new Map(metaDataCountsResult.rows.map((item) => [item.seniorid, Number(item.count)]));
        return classesResult.rows.map((classRow) => ({
            ...classRow,
            comments: commentsBySeniorId.get(classRow.id) ?? [],
            objectMetaDataCount: metaDataCountBySeniorId.get(classRow.id) ?? 0,
        }));
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function getClassDetails(id) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    let classDetails;
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
			 FROM classes AS class
			 LEFT JOIN classes AS child ON child.id = class.childclassid
			 LEFT JOIN classes AS parent ON parent.id = class.parentclassid
			 WHERE class.id = $1`,
            values: [id],
            source: 'Данные класса',
            database: options.database,
        });
        classDetails = result.rows[0];
    }
    finally {
        await client.end().catch(() => undefined);
    }
    if (!classDetails) {
        throw new Error('Класс не найден в базе.');
    }
    return classDetails;
}
function quoteIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
function readValue(row, ...names) {
    const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
    for (const name of names) {
        const value = values.get(name);
        if (value !== undefined && value !== null)
            return String(value);
    }
    return '';
}
async function getClassAttributes(classId, className) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const tables = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT table_schema, table_name, array_agg(lower(column_name)) AS columns
			 FROM information_schema.columns
			 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
			 GROUP BY table_schema, table_name
			 HAVING lower(table_name) LIKE '%attr%'
			    AND bool_or(lower(column_name) = 'id')
			    AND bool_or(lower(column_name) = 'name')
			    AND bool_or(lower(column_name) IN ('seniorid', 'classid', 'ownerid'))
			 ORDER BY CASE lower(table_name)
			   WHEN 'attributes' THEN 0 WHEN 'classattributes' THEN 1 WHEN 'objattributes' THEN 2 ELSE 3 END,
			   table_name`,
            source: 'Поиск таблицы атрибутов',
            database: options.database,
        });
        const table = tables.rows[0];
        if (!table)
            throw new Error('В схеме базы данных не найдена таблица атрибутов классов.');
        const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
        if (!ownerColumn)
            throw new Error('В таблице атрибутов не найдена ссылка на класс.');
        const orderColumn = ['ord', 'line', 'linenumber', 'name'].find(column => table.columns.includes(column)) ?? 'id';
        const source = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT to_jsonb(attribute) AS data
			 FROM ${source} AS attribute
			 WHERE attribute.${quoteIdentifier(ownerColumn)} = $1
			 ORDER BY attribute.${quoteIdentifier(orderColumn)} NULLS LAST, attribute.${quoteIdentifier('id')}`,
            values: [classId],
            source: `Атрибуты класса ${className}`,
            database: options.database,
        });
        return result.rows.map(({ data }) => ({
            id: readValue(data, 'id'),
            name: readValue(data, 'name'),
            owner: readValue(data, 'owner', 'ownername', 'classname') || className,
            signature: readValue(data, 'signature', 'parameters', 'params', 'args', 'declaration'),
            type: readValue(data, 'type', 'typename', 'attributetype', 'kind'),
            visibility: readValue(data, 'visibility', 'access', 'scope'),
            package: readValue(data, 'package', 'packagename'),
            line: readValue(data, 'line', 'linenumber', 'row', 'rownum'),
        }));
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function getClassMethods(classId, className, includeInherited) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const text = includeInherited
            ? `WITH RECURSIVE class_chain AS (
			     SELECT class.id, class.seniorid, 0 AS depth, ARRAY[class.id] AS path
			     FROM classes AS class
			     WHERE class.id = $1
			     UNION ALL
			     SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
			     FROM classes AS parent
			     INNER JOIN class_chain AS chain ON parent.id = chain.seniorid
			     WHERE NOT parent.id = ANY(chain.path)
			   )
			   SELECT to_jsonb(method) AS data, owner.name AS ownername, chain.depth
			   FROM class_chain AS chain
			   INNER JOIN methods AS method ON method.seniorid = chain.id
			   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
			   ORDER BY chain.depth, lower(method.name), method.id`
            : `SELECT to_jsonb(method) AS data, owner.name AS ownername, 0 AS depth
			   FROM methods AS method
			   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
			   WHERE method.seniorid = $1
			   ORDER BY lower(method.name), method.id`;
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text,
            values: [classId],
            source: includeInherited ? `Методы класса ${className} с наследованием` : `Методы класса ${className}`,
            database: options.database,
        });
        const methods = result.rows.map(({ data, ownername, depth }) => ({
            id: readValue(data, 'id'),
            name: readValue(data, 'name', 'methname'),
            owner: ownername ?? (readValue(data, 'owner', 'ownername', 'classname') || className),
            signature: decodeDatabaseText(readValue(data, 'signature', 'methsignature', 'parameters', 'params')),
            type: methodTypeName(readValue(data, 'methtype', 'type', 'typename')),
            visibility: readValue(data, 'visibility', 'visible', 'access', 'scope'),
            package: readValue(data, 'package', 'packagename'),
            line: readValue(data, 'line', 'linenumber', 'row', 'rownum'),
            inherited: depth > 0,
        }));
        if (!includeInherited) {
            return methods;
        }
        const visibleMethods = new Map();
        for (const method of methods) {
            const key = method.name.toLocaleUpperCase('ru');
            if (!visibleMethods.has(key)) {
                visibleMethods.set(key, method);
            }
        }
        return [...visibleMethods.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
function methodTypeName(value) {
    switch (value) {
        case '1': return 'Объектный';
        case '2': return 'Внешняя процедура';
        case '3': return 'Интерпретируемый';
        case '4': return 'Visual Basic';
        case '5': return 'Java';
        default: return value;
    }
}
function decodeDatabaseText(value) {
    const bytea = value.match(/^\\x([\da-f]+)$/i);
    if (!bytea || bytea[1].length % 2 !== 0) {
        return value;
    }
    return iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251');
}
//# sourceMappingURL=classRepository.js.map