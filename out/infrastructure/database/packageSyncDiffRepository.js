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
exports.loadPackageDatabaseVersion = loadPackageDatabaseVersion;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const iconv = __importStar(require("iconv-lite"));
const pkfDatabaseReconstruction_1 = require("../../features/package-sync/pkfDatabaseReconstruction");
const pkfMetaReconstruction_1 = require("../../features/package-sync/pkfMetaReconstruction");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
const projectDatabaseSession_1 = require("./projectDatabaseSession");
const BLOB_ATTRIBUTE_TYPE = 320;
const BOOLEAN_ATTRIBUTE_TYPE = 310;
const META_CLASS_IDS = new Set([3, 4, 5, 10200019]);
async function loadPackageDatabaseVersion(item, fileName) {
    if (path.extname(fileName).toLocaleLowerCase('en-US') !== '.pkf') {
        throw new Error('Реконструкция из БД пока поддерживается только для PKF.');
    }
    return (0, projectDatabaseSession_1.withProjectDatabaseSession)(async ({ client, options }) => {
        const fileResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT ContentMD5 AS contentmd5, IsAutoGroup AS isautogroup, AutoGroup AS autogroup FROM SysFile WHERE ID = $1', values: [item.objectId],
            source: 'Синхронизация пакетов: проверка базовой версии PKF', database: options.database,
        });
        const fileRow = fileResult.rows[0];
        if (!fileRow) {
            throw new Error(`Файл ID ${item.objectId} не найден в SysFile.`);
        }
        const databaseMd5 = String(fileRow.contentmd5 ?? item.contentMd5 ?? '').toUpperCase();
        const bytes = await (0, promises_1.readFile)(fileName).catch(error => isFileNotFound(error) ? undefined : Promise.reject(error));
        let source;
        let localContent;
        if (bytes) {
            const localMd5 = (0, node_crypto_1.createHash)('md5').update(bytes).digest('hex').toUpperCase();
            if (!databaseMd5) {
                // The package editor keeps the previous working-copy file when the database file is deleted.
                // Show that file on the left and an empty database version on the right.
                return { content: '', addedObjectIds: [] };
            }
            if (databaseMd5 !== localMd5) {
                throw new Error(`Локальный PKF не совпадает с базовой версией БД (MD5 ${localMd5}, ожидался ${databaseMd5}).`);
            }
            source = iconv.decode(bytes, 'win1251');
        }
        else {
            if (databaseMd5) {
                throw new Error(`Локальный файл не найден, хотя в БД присутствует базовый MD5 ${databaseMd5}.`);
            }
            source = (0, pkfDatabaseReconstruction_1.createEmptyPkf)(Number(fileRow.isautogroup) !== 0 ? fileRow.autogroup : undefined);
            localContent = '';
        }
        const localIds = (0, pkfDatabaseReconstruction_1.extractPkfObjectIds)(source);
        const abstractResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT ID AS id, ClassID AS classid, Name AS name FROM Abstract WHERE SysFile = $1 ORDER BY ID', values: [item.objectId],
            source: 'Синхронизация пакетов: состав PKF из БД', database: options.database,
        });
        const missingRows = abstractResult.rows.filter(row => !localIds.has(Number(row.id)));
        const hasMetaObjects = abstractResult.rows.some(row => META_CLASS_IDS.has(Number(row.classid)));
        if (hasMetaObjects) {
            if (abstractResult.rows.some(row => !META_CLASS_IDS.has(Number(row.classid)))) {
                throw new Error('Meta-PKF содержит смешанные конструкции, которые пока нельзя безопасно сериализовать.');
            }
            const content = await loadMetaPkf(client, options.database, item.objectId);
            return { content, addedObjectIds: missingRows.map(row => Number(row.id)), localContent };
        }
        const objects = await buildDatabaseObjects(client, options.database, abstractResult.rows);
        const databaseSource = (0, pkfDatabaseReconstruction_1.createEmptyPkf)(Number(fileRow.isautogroup) !== 0 ? fileRow.autogroup : undefined);
        return { content: (0, pkfDatabaseReconstruction_1.appendPkfObjects)(databaseSource, objects), addedObjectIds: missingRows.map(row => Number(row.id)), localContent };
    }, undefined, 'vc-ve-tools-package-diff');
}
async function loadMetaPkf(client, database, fileId) {
    const classResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT C.ID AS id, C.Name AS name, C.Aliases AS aliases, Parent.Name AS parentname,
			 C.Virtual AS virtual, C.CacheObjClass AS cacheobjclass, C.RefIntegrityCheck AS refintegritycheck
			 FROM Abstract A JOIN Classes C ON C.ID = A.ID LEFT JOIN Abstract Parent ON Parent.ID = C.SeniorID
			 WHERE A.SysFile = $1 ORDER BY C.ID`, values: [fileId], source: 'Синхронизация пакетов: класс нового meta-PKF', database,
    });
    const attributeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT Attr.ID AS id, Attr.Name AS name, Attr.Aliases AS aliases, Attr.Visibility AS visibility,
			 Attr.AttrType AS attrtype, ValueClass.Name AS valueclassname, Attr.DBFieldName AS dbfieldname,
			 Attr.RoleRead AS roleread, Attr.RoleWrite AS rolewrite, Attr.RefIntegrityCheck AS refintegritycheck
			 FROM Abstract A JOIN Attributes Attr ON Attr.ID = A.ID
			 LEFT JOIN Abstract ValueClass ON ValueClass.ID = NULLIF(split_part(COALESCE(Attr.ValueClasses, ''), ',', 1), '')::integer
			 WHERE A.SysFile = $1 ORDER BY Attr.ID`, values: [fileId], source: 'Синхронизация пакетов: атрибуты нового meta-PKF', database,
    });
    const defaultResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT D.ID AS id, Attr.Name AS name, Attr.Visibility AS visibility, Attr.AttrType AS attrtype, D.DefValue AS defvalue
			 FROM Abstract A JOIN DfltValues D ON D.ID = A.ID JOIN Attributes Attr ON Attr.ID = D.AttrID
			 WHERE A.SysFile = $1 ORDER BY D.ID`, values: [fileId], source: 'Синхронизация пакетов: значения по умолчанию нового meta-PKF', database,
    });
    const methodResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT M.ID AS id, M.Name AS name, M.Aliases AS aliases, M.Visibility AS visibility,
			 M.MethKind AS methkind, M.Signature AS signature, M.Code AS code
			 FROM Abstract A JOIN Methods M ON M.ID = A.ID WHERE A.SysFile = $1 ORDER BY M.ID`,
        values: [fileId], source: 'Синхронизация пакетов: методы нового meta-PKF', database,
    });
    if (classResult.rows.length !== 1) {
        throw new Error(`Ожидался один корневой класс meta-PKF, найдено: ${classResult.rows.length}.`);
    }
    if (attributeResult.rows.some(row => Number(row.attrtype) !== 330 || !row.valueclassname)) {
        throw new Error('Новый meta-PKF содержит атрибут не поддержанного декларативного типа.');
    }
    const root = classResult.rows[0];
    const members = [
        ...attributeResult.rows.map(row => ({
            kind: 'attribute', id: Number(row.id), name: row.name, aliases: row.aliases ?? '', visibility: metaVisibility(row.visibility),
            valueClassName: row.valueclassname, databaseFieldName: row.dbfieldname ?? '', readRole: nullableNumber(row.roleread),
            writeRole: nullableNumber(row.rolewrite), referenceIntegrityCheck: nullableNumber(row.refintegritycheck),
        })),
        ...defaultResult.rows.map(row => {
            const value = decodeAuditText(row.defvalue);
            return { kind: 'default', id: Number(row.id), name: row.name, visibility: metaVisibility(row.visibility), value, block: Number(row.attrtype) === BLOB_ATTRIBUTE_TYPE || /[\r\n]/u.test(value) };
        }),
        ...methodResult.rows.map(row => ({
            kind: 'method', id: Number(row.id), name: row.name, aliases: row.aliases ?? '', visibility: metaVisibility(row.visibility),
            methodKind: Number(row.methkind), signature: decodeAuditText(row.signature), code: decodeAuditText(row.code),
        })),
    ];
    return (0, pkfMetaReconstruction_1.serializePkfMetaFile)({
        id: Number(root.id), name: root.name, aliases: root.aliases ?? '', parentName: root.parentname ?? '',
        isVirtual: Number(root.virtual) !== 0, cacheObjectClass: nullableNumber(root.cacheobjclass),
        referenceIntegrityCheck: nullableNumber(root.refintegritycheck),
    }, members);
}
async function buildDatabaseObjects(client, database, rows) {
    const objects = [];
    const byClass = new Map();
    for (const row of rows) {
        const classRows = byClass.get(Number(row.classid)) ?? [];
        classRows.push(row);
        byClass.set(Number(row.classid), classRows);
    }
    for (const [classId, classObjects] of byClass) {
        objects.push(...await loadStoredDatabaseObjects(client, database, classId, classObjects));
    }
    return objects.sort((left, right) => left.id - right.id);
}
async function loadStoredDatabaseObjects(client, database, classId, objects) {
    const classResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: 'SELECT Name AS name, DBTableName AS dbtablename FROM Classes WHERE ID = $1', values: [classId],
        source: `Синхронизация пакетов: хранилище класса ${classId}`, database,
    });
    const classRow = classResult.rows[0];
    if (!classRow?.dbtablename || !/^[a-z_][a-z\d_$]*$/iu.test(classRow.dbtablename)) {
        throw new Error(`Для класса ID ${classId} не определена безопасная таблица хранения.`);
    }
    const attributeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `WITH RECURSIVE ClassTree(ID, SeniorID, Depth) AS (
		 SELECT ID, SeniorID, 0 FROM Classes WHERE ID = $1
		 UNION ALL SELECT C.ID, C.SeniorID, T.Depth + 1 FROM Classes C JOIN ClassTree T ON C.ID = T.SeniorID
		)
		SELECT Attr.ID AS id, Attr.Name AS name, Attr.DBFieldName AS dbfieldname, Attr.AttrType AS attrtype, T.Depth AS depth
		FROM Attributes Attr JOIN ClassTree T ON T.ID = Attr.SeniorID
		WHERE NULLIF(Attr.DBFieldName, '') IS NOT NULL ORDER BY T.Depth, Attr.ID`,
        values: [classId], source: `Синхронизация пакетов: атрибуты класса ${classId}`, database,
    });
    const rowResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT * FROM ${classRow.dbtablename} WHERE ID = ANY($1::integer[])`, values: [objects.map(object => Number(object.id))],
        source: `Синхронизация пакетов: объекты класса ${classId} из ${classRow.dbtablename}`, database,
    });
    const storedById = new Map(rowResult.rows.map(row => [Number(row.id), row]));
    const attributesByField = new Map();
    for (const attribute of attributeResult.rows) {
        const field = attribute.dbfieldname?.toLocaleLowerCase('en-US');
        if (field && !attributesByField.has(field)) {
            attributesByField.set(field, attribute);
        }
    }
    return objects.map(object => {
        const stored = storedById.get(Number(object.id));
        if (!stored) {
            throw new Error(`Объект ID ${object.id} не найден в таблице ${classRow.dbtablename}.`);
        }
        const fields = new Map(Object.entries(stored).map(([name, value]) => [name.toLocaleLowerCase('en-US'), value]));
        const properties = [...attributesByField].flatMap(([field, attribute]) => {
            if ([100, 101, 103, 105, 106].includes(Number(attribute.id))) {
                return [];
            }
            const rawValue = fields.get(field);
            if (rawValue === null || rawValue === undefined || rawValue === '') {
                return [];
            }
            const value = formatStoredValue(rawValue, Number(attribute.attrtype), attribute.name, Number(object.id));
            if (value === '') {
                return [];
            }
            return [{ attributeId: Number(attribute.id), name: attribute.name, value, format: /[\r\n]/u.test(value) ? 'block' : 'scalar' }];
        });
        return { id: Number(object.id), className: classRow.name, name: object.name ?? '$', properties };
    });
}
function decodeAuditText(value) {
    if (Buffer.isBuffer(value)) {
        return iconv.decode(value, 'win1251');
    }
    const text = String(value ?? '');
    const bytea = text.match(/^\\x([\da-f]+)$/iu);
    return bytea ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}
function formatBoolean(value, attributeName, objectId) {
    if (value === '-1' || value === '1' || value.toLocaleLowerCase('en-US') === 'true') {
        return 'true';
    }
    if (value === '0' || value.toLocaleLowerCase('en-US') === 'false') {
        return 'false';
    }
    throw new Error(`Булев атрибут ${attributeName} объекта ID ${objectId} содержит значение ${value}.`);
}
function formatStoredValue(value, attributeType, attributeName, objectId) {
    if (attributeType === BOOLEAN_ATTRIBUTE_TYPE) {
        return formatBoolean(String(value), attributeName, objectId);
    }
    if (value instanceof Date) {
        const part = (number) => String(number).padStart(2, '0');
        return `${part(value.getDate())}.${part(value.getMonth() + 1)}.${value.getFullYear()} ${value.getHours()}:${part(value.getMinutes())}:${part(value.getSeconds())}`;
    }
    const text = Buffer.isBuffer(value) ? iconv.decode(value, 'win1251') : String(value);
    if (text.includes('\0') || text.includes('\uFFFD')) {
        throw new Error(`Атрибут ${attributeName} объекта ID ${objectId} содержит неподдерживаемые двоичные данные.`);
    }
    return text;
}
function metaVisibility(value) {
    if (Number(value) === 12450284) {
        return 'protected';
    }
    if (Number(value) === 12450285) {
        return 'private';
    }
    if (Number(value) === 12450287) {
        return 'published';
    }
    return 'public';
}
function nullableNumber(value) { return value === null ? null : Number(value); }
function isFileNotFound(error) { return error?.code === 'ENOENT'; }
//# sourceMappingURL=packageSyncDiffRepository.js.map