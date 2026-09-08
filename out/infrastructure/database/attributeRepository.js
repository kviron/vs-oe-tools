"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttributeEditorOptions = getAttributeEditorOptions;
exports.createClassAttribute = createClassAttribute;
const pg_1 = require("pg");
const attributeCreation_1 = require("../../features/classes/attributeCreation");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const sessionContext_1 = require("../configuration/sessionContext");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
async function getAttributeEditorOptions(ownerClassId) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const owner = await loadOwner(client, options.database, ownerClassId);
        const [types, visibilities, distributionModes] = await Promise.all([
            (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, { text: 'SELECT id, name FROM attrtypes ORDER BY id', source: 'Типы нового атрибута', database: options.database }),
            (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, { text: 'SELECT id, COALESCE(fullname, name) AS name FROM enum WHERE classid = $1 ORDER BY id', values: [attributeCreation_1.attributeVisibilityClassId], source: 'Видимость нового атрибута', database: options.database }),
            (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, { text: 'SELECT id, COALESCE(fullname, name) AS name FROM enum WHERE classid = $1 ORDER BY id', values: [attributeCreation_1.attributeDistributionClassId], source: 'Дистрибуция нового атрибута', database: options.database }),
        ]);
        return {
            ownerClassId: owner.id,
            ownerClassName: owner.name,
            types: types.rows,
            visibilities: visibilities.rows,
            distributionModes: distributionModes.rows,
            defaults: { visibilityId: attributeCreation_1.defaultAttributeVisibilityId, distributionModeId: attributeCreation_1.defaultAttributeDistributionModeId, isNotNull: false, virtual: true, refIntegrityCheck: false },
        };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function createClassAttribute(input) {
    (0, attributeCreation_1.validateClassAttributeDraft)(input);
    const draft = (0, attributeCreation_1.normalizeClassAttributeDraft)(input);
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        await client.query('BEGIN');
        const session = await (0, sessionContext_1.getSessionContext)(client, options.database);
        const owner = await loadOwner(client, options.database, draft.ownerClassId, true);
        const developerRangeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT developer_range.id, developer_range.beginid, developer_range.endid
			 FROM users AS session_user_row
			 JOIN users AS developer_user ON developer_user.person = session_user_row.person
			 JOIN developerids AS developer_range ON developer_range.userid = developer_user.id
			 WHERE session_user_row.id = $1
			 ORDER BY CASE WHEN developer_user.id = session_user_row.id THEN 0 ELSE 1 END, developer_range.beginid DESC
			 LIMIT 1`,
            values: [session.userId], source: 'Диапазон ID нового атрибута', database: options.database,
        });
        const range = developerRangeResult.rows[0];
        if (!range) {
            throw new Error(`Для пользователя ${session.userId} не найден диапазон DeveloperIDs.`);
        }
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [attributeCreation_1.attributeClassId, range.id],
            source: 'Блокировка генерации ID атрибута', database: options.database,
        });
        const duplicate = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT id FROM attributes WHERE seniorid = $1
			 AND (upper(name) = upper($2) OR ($3 <> '' AND upper(COALESCE(dbfieldname, '')) = upper($3))) LIMIT 1`,
            values: [draft.ownerClassId, draft.name, draft.dbFieldName], source: 'Проверка имени нового атрибута', database: options.database,
        });
        if (duplicate.rowCount) {
            throw new Error(`В классе ${owner.name} уже есть атрибут с таким именем или полем таблицы.`);
        }
        const typeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT id FROM attrtypes WHERE id = $1', values: [draft.attributeTypeId], source: 'Проверка типа атрибута', database: options.database,
        });
        if (!typeResult.rowCount) {
            throw new Error(`Тип атрибута ${draft.attributeTypeId} не найден.`);
        }
        const enumResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT id,classid FROM enum WHERE (id=$1 AND classid=$2) OR (id=$3 AND classid=$4)',
            values: [draft.visibilityId, attributeCreation_1.attributeVisibilityClassId, draft.distributionModeId, attributeCreation_1.attributeDistributionClassId],
            source: 'Проверка видимости и дистрибуции атрибута', database: options.database,
        });
        if (enumResult.rowCount !== 2) {
            throw new Error('Выбрана неизвестная область видимости или дистрибуция.');
        }
        const valueClassIds = (0, attributeCreation_1.parseValueClassIds)(draft.valueClasses);
        if (valueClassIds.length) {
            const references = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
                text: 'SELECT id FROM abstract WHERE id = ANY($1::integer[])', values: [valueClassIds], source: 'Проверка классов значений атрибута', database: options.database,
            });
            if (references.rowCount !== valueClassIds.length) {
                throw new Error('Один или несколько классов значений не найдены.');
            }
        }
        const idResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT candidate AS id FROM generate_series($1::integer, $2::integer) AS candidate
			 WHERE NOT EXISTS (SELECT 1 FROM abstract WHERE id = candidate) ORDER BY candidate LIMIT 1`,
            values: [range.beginid, range.endid], source: 'Генерация ID нового атрибута', database: options.database,
        });
        const id = Number(idResult.rows[0]?.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new Error(`В диапазоне DeveloperIDs ${range.beginid}…${range.endid} нет свободного ID.`);
        }
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `INSERT INTO attributes
			 (lastchange,id,classid,seniorid,name,aliases,visibility,dbfieldname,attrtype,isnotnull,valueclasses,attrvaluedistrmode,virtual,refintegritycheck)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            values: [session.changeDate, id, attributeCreation_1.attributeClassId, draft.ownerClassId, draft.name, draft.aliases || null,
                draft.visibilityId, draft.dbFieldName || null, draft.attributeTypeId, draft.isNotNull ? -1 : 0, draft.valueClasses || null,
                draft.distributionModeId, -1, draft.refIntegrityCheck ? 1 : 0],
            source: `Создание атрибута ${draft.name}`, database: options.database,
        });
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'INSERT INTO abstract (lastchange,id,classid,seniorid,name,sysfile) VALUES ($1,$2,$3,$4,$5,$6)',
            values: [session.changeDate, id, attributeCreation_1.attributeClassId, draft.ownerClassId, draft.name, owner.sysfile],
            source: `Создание Abstract атрибута ${id}`, database: options.database,
        });
        for (const valueClassId of valueClassIds) {
            await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
                text: 'INSERT INTO objrefs(obj,ref,attr) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
                values: [id, valueClassId, attributeCreation_1.valueClassesReferenceAttributeId], source: `Ссылка класса значений атрибута ${id}`, database: options.database,
            });
        }
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `INSERT INTO logcchangedobject
			 (objid,objclassid,changetype,newvalues,userid,computername,changedate,oldvalues,transactioncomment,versionobject,rootobjid,rootobjclassid)
			 VALUES ($1,$2,3,$3,$4,$5,$6,$7,$8,'1899-12-30 00:00:00',$9,3)`,
            values: [id, attributeCreation_1.attributeClassId, (0, attributeCreation_1.encodeAttributeAuditValues)(draft), session.userId, session.computerName,
                session.changeDate, Buffer.alloc(0), 'Сохранение объекта класса "Атрибут', draft.ownerClassId],
            source: `Логирование создания атрибута ${id}`, database: options.database,
        });
        const version = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `UPDATE classes SET classversion = CASE WHEN classversion = 2147483647 THEN -2147483648
			 ELSE COALESCE(classversion,0) + 1 END WHERE id = $1`,
            values: [draft.ownerClassId], source: `Обновление версии класса ${draft.ownerClassId}`, database: options.database,
        });
        if (version.rowCount !== 1) {
            throw new Error(`Класс ${draft.ownerClassId} исчез во время сохранения.`);
        }
        if (owner.sysfile !== null) {
            await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
                text: 'UPDATE syspackagebase SET objectchangestate = 1 WHERE objectid = $1', values: [owner.sysfile],
                source: `Отметка пакетного файла ${owner.sysfile} изменённым`, database: options.database,
            });
        }
        await client.query('COMMIT');
        return { id, ownerClassId: draft.ownerClassId, name: draft.name };
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function loadOwner(client, database, ownerClassId, forUpdate = false) {
    const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT class.id,class.name,abstract.sysfile FROM classes AS class
		 JOIN abstract ON abstract.id=class.id WHERE class.id=$1${forUpdate ? ' FOR UPDATE OF class' : ''}`,
        values: [ownerClassId], source: `Класс-владелец атрибута ${ownerClassId}`, database,
    });
    const owner = result.rows[0];
    if (!owner) {
        throw new Error(`Класс ${ownerClassId} не найден.`);
    }
    return owner;
}
//# sourceMappingURL=attributeRepository.js.map