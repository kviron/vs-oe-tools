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
exports.getObjectView = getObjectView;
const pg_1 = require("pg");
const iconv = __importStar(require("iconv-lite"));
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
async function getObjectView(objectId) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const identityResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT object.id::text, object.name, object.classid::text,
			             class.name AS classname, class.dbtablename,
			             owner.name AS ownername, owner.id::text AS ownerid,
			             object_group.name AS groupname, object_group.id::text AS groupid,
			             file.filename, file_group.path AS grouppath, package.packagename
			      FROM abstract AS object
			      LEFT JOIN classes AS class ON class.id = object.classid
			      LEFT JOIN abstract AS owner ON owner.id = object.seniorid
			      LEFT JOIN abstract AS object_group ON object_group.id = owner.seniorid
			      LEFT JOIN sysfile AS file ON file.id = object.sysfile
			      LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			      LEFT JOIN syspackages AS package ON package.id = file_group.package
			      WHERE object.id = $1`,
            values: [objectId], source: `Объект ${objectId}`, database: options.database,
        });
        const identity = identityResult.rows[0];
        if (!identity) {
            throw new Error(`Объект ${objectId} не найден.`);
        }
        if (!identity.dbtablename?.trim()) {
            throw new Error(`Для класса ${identity.classname ?? identity.classid} не задана таблица хранения.`);
        }
        const columnsResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT table_schema, table_name, column_name FROM information_schema.columns
			       WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND lower(table_name) = lower($1)
			       ORDER BY CASE WHEN table_schema = current_schema() THEN 0 ELSE 1 END, ordinal_position`,
            values: [identity.dbtablename], source: `Поля объекта ${objectId}`, database: options.database,
        });
        if (!columnsResult.rows.length) {
            throw new Error(`Таблица ${identity.dbtablename} не найдена.`);
        }
        const schema = columnsResult.rows[0].table_schema;
        const table = columnsResult.rows[0].table_name;
        const columns = columnsResult.rows.filter(row => row.table_schema === schema && row.table_name === table);
        const idColumn = columns.find(row => row.column_name.toLocaleLowerCase() === 'id')?.column_name;
        if (!idColumn) {
            throw new Error(`В таблице ${table} не найдено поле ID.`);
        }
        const dataResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT to_jsonb(object_row) AS data FROM ${quote(schema)}.${quote(table)} AS object_row WHERE ${quote(idColumn)} = $1`,
            values: [objectId], source: `Значения объекта ${objectId}`, database: options.database,
        });
        const data = dataResult.rows[0]?.data;
        if (!data) {
            throw new Error(`Запись объекта ${objectId} не найдена в таблице ${table}.`);
        }
        const attributesResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `WITH RECURSIVE class_chain AS (
			         SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
			         UNION ALL SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
			         FROM classes parent JOIN class_chain chain ON chain.seniorid = parent.id
			         WHERE NOT parent.id = ANY(chain.path)
			       )
			       SELECT attribute.id::text, attribute.name, attribute.title, attribute.dbfieldname,
			              to_jsonb(attribute)->'distribution' AS distribution
			       FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
			       WHERE COALESCE(attribute.static, 0) = 0
			       ORDER BY chain.depth, attribute.ord NULLS LAST, attribute.id`,
            values: [Number(identity.classid)], source: `Атрибуты объекта ${objectId}`, database: options.database,
        });
        const propertiesResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `WITH RECURSIVE class_chain AS (
			         SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
			         UNION ALL SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
			         FROM classes parent JOIN class_chain chain ON chain.seniorid = parent.id
			         WHERE NOT parent.id = ANY(chain.path)
			       )
			       SELECT property.id::text, property.name, property.aliases, read_attribute.dbfieldname
			       FROM class_chain chain
			       JOIN properties property ON property.seniorid = chain.id
			       LEFT JOIN attributes read_attribute ON read_attribute.id = property.readmember
			       ORDER BY chain.depth, lower(property.name), property.id`,
            values: [Number(identity.classid)], source: `Свойства объекта ${objectId}`, database: options.database,
        });
        const actualKeys = new Map(Object.keys(data).map(key => [key.toLocaleLowerCase(), key]));
        const used = new Set();
        const fields = [];
        const systemProperties = [
            ['_Группа', identity.groupname ? `${identity.groupname} (${identity.groupid})` : null, ''],
            ['_Пакет', identity.packagename, ''],
            ['_ПолныйПутьКФайлу', [identity.packagename, identity.grouppath, identity.filename].filter(Boolean).join('\\'), ''],
            ['_ПутьКПакетам', identity.packagename, ''],
            ['_ПутьКФайлу', [identity.packagename, identity.grouppath].filter(Boolean).join('\\'), ''],
            ['_Файл', identity.filename, ''],
            ['AsJsonString', null, ''],
            ['Версия', data.lastchange ?? data.LastChange ?? null, ''],
            ['Изменен', null, ''],
            ['Проверен', null, ''],
            ['ПроверятьПраваДоступа', null, ''],
            ['СостояниеОбъекта', null, ''],
        ];
        for (const [name, value, tableField] of systemProperties) {
            fields.push({ kind: 'property', attributeId: null, attributeName: name, value: serializable(value), tableField, distribution: '' });
        }
        for (const attribute of attributesResult.rows) {
            const field = attribute.dbfieldname?.trim();
            const actual = field ? actualKeys.get(field.toLocaleLowerCase()) : undefined;
            if (actual) {
                used.add(actual.toLocaleLowerCase());
            }
            fields.push({
                kind: 'attribute', attributeId: attribute.id,
                attributeName: attribute.title?.trim() || attribute.name,
                value: actual ? serializable(data[actual]) : null,
                tableField: field ?? '', distribution: display(attribute.distribution),
            });
        }
        for (const property of propertiesResult.rows) {
            const field = property.dbfieldname?.trim();
            const actual = field ? actualKeys.get(field.toLocaleLowerCase()) : undefined;
            if (actual) {
                used.add(actual.toLocaleLowerCase());
            }
            fields.push({
                kind: 'property', attributeId: property.id,
                attributeName: property.aliases?.trim() || property.name,
                value: actual ? serializable(data[actual]) : null,
                tableField: field ?? '', distribution: '',
            });
        }
        for (const [key, value] of Object.entries(data)) {
            if (used.has(key.toLocaleLowerCase())) {
                continue;
            }
            fields.push({ kind: 'property', attributeId: null, attributeName: key, value: serializable(value), tableField: key, distribution: '' });
        }
        return { id: identity.id, name: identity.name ?? '', classId: identity.classid, className: identity.classname ?? '', fields };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
function quote(value) { return `"${value.replace(/"/g, '""')}"`; }
function display(value) { return value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value); }
function serializable(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return iconv.decode(value, 'win1251');
    }
    if (typeof value === 'string') {
        const bytea = value.match(/^\\x([\da-f]+)$/i);
        if (bytea && bytea[1].length % 2 === 0) {
            return iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251');
        }
    }
    if (Array.isArray(value)) {
        return value.map(serializable);
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializable(item)]));
    }
    return value;
}
//# sourceMappingURL=objectViewRepository.js.map