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
exports.findMethodsByName = findMethodsByName;
exports.getMethodSource = getMethodSource;
exports.saveMethodSource = saveMethodSource;
exports.createClassMethod = createClassMethod;
const pg_1 = require("pg");
const iconv = __importStar(require("iconv-lite"));
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const sessionContext_1 = require("../configuration/sessionContext");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
const changeValuesSerialization_1 = require("./changeValuesSerialization");
const methodSignature_1 = require("./methodSignature");
const methodCreation_1 = require("../../features/methods/methodCreation");
async function findMethodsByName(name, databaseOptions) {
    const options = databaseOptions ?? await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT method.id, method.name, method.seniorid
			 FROM methods AS method
			 WHERE lower(method.name) = lower($1)
			 ORDER BY method.id
			 LIMIT 20`,
            values: [name],
            source: `Поиск метода или функции ${name}`,
            database: options.database,
        });
        return result.rows.map(row => ({ id: row.id, name: row.name, seniorId: row.seniorid }));
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function getMethodSource(id, databaseOptions) {
    const options = databaseOptions ?? await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT method.id, method.name, method.seniorid, method.methtype,
			        method.signature, pg_typeof(method.signature)::text AS signaturetype,
			        method.code, pg_typeof(method.code)::text AS codetype
			 FROM methods AS method
			 WHERE method.id = $1`,
            values: [id], source: `Код метода ${id}`, database: options.database,
        });
        const row = result.rows[0];
        if (!row) {
            throw new Error(`Метод ${id} не найден в базе.`);
        }
        return {
            id: row.id, name: row.name, seniorId: row.seniorid, methodType: row.methtype,
            signature: decodeCode(row.signature), signatureType: row.signaturetype,
            code: decodeCode(row.code), codeType: row.codetype,
        };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function saveMethodSource(method, code, log = () => undefined, databaseOptions) {
    log(`Старт сохранения ID=${method.id}; codeType=${method.codeType}; ${inspectValue(code)}.`);
    const encoded = encodeWindows1251(code);
    log(`Новый код проверен и закодирован в WIN1251: bytes=${encoded.byteLength}.`);
    const options = databaseOptions ?? await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        log(`Подключение к БД ${options.database} установлено.`);
        await client.query('BEGIN');
        log('Транзакция BEGIN.');
        // Получаем старый код перед обновлением
        const oldCodeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT method.signature, pg_typeof(method.signature)::text AS signaturetype,
			        method.code, pg_typeof(method.code)::text AS codetype, abstract.sysfile
			 FROM methods AS method
			 JOIN abstract ON abstract.id = method.id
			 WHERE method.id = $1`,
            values: [method.id],
            source: `Получение старого кода метода ${method.id}`,
            database: options.database,
        });
        if (oldCodeResult.rowCount !== 1) {
            throw new Error(`Метод ${method.id} не найден при получении старого кода.`);
        }
        const oldCodeRow = oldCodeResult.rows[0];
        const oldCodeValue = decodeCode(oldCodeRow.code);
        const oldSignature = decodeCode(oldCodeRow.signature);
        const nextSignature = (0, methodSignature_1.resolveMethodSignature)(oldCodeValue, code, oldSignature);
        log(`Старый код прочитан: ${inspectValue(oldCodeValue)}.`);
        log(`Сигнатура метода: старая=${JSON.stringify(oldSignature)}; новая=${JSON.stringify(nextSignature)}.`);
        // Сравниваем старый и новый код
        if (oldCodeValue === code) {
            // Код не изменился, откатываем транзакцию и выходим
            await client.query('ROLLBACK');
            return;
        }
        // Получаем контекст сессии (UserID, ComputerName, ChangeDate)
        const sessionContext = await (0, sessionContext_1.getSessionContext)(client, options.database);
        // Выполняем обновление методов
        const lastChange = sessionContext.changeDate;
        const codeValue = isBinaryCodeType(method.codeType) ? encoded : code;
        const signatureValue = isBinaryCodeType(oldCodeRow.signaturetype)
            ? encodeWindows1251(nextSignature)
            : nextSignature;
        const methodResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `UPDATE methods
			 SET lastchange = $1, signature = $2, code = $3, seniorid = $4
			 WHERE id = $5`,
            values: [lastChange, signatureValue, codeValue, method.seniorId, method.id],
            source: `Сохранение метода ${method.name}`,
            database: options.database,
        });
        log(`UPDATE methods выполнен: rowCount=${methodResult.rowCount}.`);
        if (methodResult.rowCount !== 1) {
            throw new Error(`Метод ${method.id} не найден при сохранении.`);
        }
        // Обновляем abstract
        const abstractResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `UPDATE abstract
			 SET lastchange = $1, seniorid = $2
			 WHERE id = $3`,
            values: [lastChange, method.seniorId, method.id],
            source: `Сохранение abstract метода ${method.name}`,
            database: options.database,
        });
        log(`UPDATE abstract выполнен: rowCount=${abstractResult.rowCount}.`);
        if (abstractResult.rowCount !== 1) {
            throw new Error(`Запись abstract ${method.id} не найдена при сохранении.`);
        }
        // Формируем NewValues и OldValues для LogCChangedObject
        const newValues = toWindows1251Text((0, changeValuesSerialization_1.serializeChangeValues)(code, method.seniorId, nextSignature));
        const oldValues = toWindows1251Text((0, changeValuesSerialization_1.serializeChangeValues)(oldCodeValue, method.seniorId, oldSignature));
        log(`Значения аудита подготовлены: NewValues ${inspectValue(newValues)}; OldValues ${inspectValue(oldValues)}.`);
        // Вставляем запись в LogCChangedObject
        const logResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `INSERT INTO LogCChangedObject (
			 ObjID,
			 ObjClassID,
			 ChangeType,
			 NewValues,
			 UserID,
			 ComputerName,
			 ChangeDate,
			 OldValues,
			 TransactionComment,
			 VersionObject,
			 RootObjID,
			 RootObjClassID
			) VALUES (
			 $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
			)`,
            values: [
                method.id, // ObjID - ID метода
                5, // ObjClassID - класс метода
                2, // ChangeType - изменение существующего объекта
                newValues, // NewValues - сериализованные новые значения
                sessionContext.userId, // UserID - ID пользователя
                sessionContext.computerName, // ComputerName - имя компьютера
                lastChange, // ChangeDate - дата изменения
                oldValues, // OldValues - сериализованные старые значения
                '', // TransactionComment - пустой комментарий
                '1899-12-30 00:00:00', // Строка обязательна: JS Date искажает историческую дату часовым поясом.
                method.seniorId, // RootObjID - ID родительского класса (SeniorID)
                3, // RootObjClassID - класс класса
            ],
            source: `Логирование изменения метода ${method.name}`,
            database: options.database,
        });
        log(`INSERT LogCChangedObject выполнен: rowCount=${logResult.rowCount}.`);
        if (logResult.rowCount !== 1) {
            throw new Error(`Ошибка при записи в LogCChangedObject для метода ${method.id}.`);
        }
        // Клиент ВЭ меняет версию класса после сохранения его метода. Конкретное число
        // вычисляется клиентом из загруженной структуры; для сброса кэшей достаточно
        // гарантированно изменить int32-версию.
        const classVersionResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `UPDATE classes
			 SET classversion = CASE
			   WHEN classversion = 2147483647 THEN -2147483648
			   ELSE COALESCE(classversion, 0) + 1
			 END
			 WHERE id = $1`,
            values: [method.seniorId],
            source: `Обновление версии класса ${method.seniorId}`,
            database: options.database,
        });
        log(`UPDATE Classes.ClassVersion выполнен: rowCount=${classVersionResult.rowCount}.`);
        if (classVersionResult.rowCount !== 1) {
            throw new Error(`Родительский класс ${method.seniorId} не найден при обновлении версии.`);
        }
        const sysFileId = oldCodeRow.sysfile === null || oldCodeRow.sysfile === undefined
            ? undefined
            : Number(oldCodeRow.sysfile);
        if (sysFileId !== undefined) {
            await markPackageFileChanged(client, options.database, sysFileId, sessionContext.userId, lastChange);
            log(`Пакетный файл ${sysFileId} зарегистрирован как изменённый.`);
        }
        await client.query('COMMIT');
        method.signature = nextSignature;
        log('Транзакция COMMIT.');
    }
    catch (error) {
        log(`Ошибка SQL-этапа: ${error instanceof Error ? error.message : String(error)}.`);
        await client.query('ROLLBACK').catch(() => undefined);
        log('Транзакция ROLLBACK.');
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * Reproduces the persistence side effects of Функции_Объект.СоздатьМетод for
 * the interpreted, non-static method variant supported by the extension.
 */
async function createClassMethod(input, databaseOptions) {
    (0, methodCreation_1.validateClassMethodDraft)(input);
    const draft = (0, methodCreation_1.normalizeClassMethodDraft)(input);
    const encodedSignature = encodeWindows1251(draft.signature);
    const encodedCode = encodeWindows1251(draft.code);
    const options = databaseOptions ?? await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        await client.query('BEGIN');
        const session = await (0, sessionContext_1.getSessionContext)(client, options.database);
        const ownerResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT class.id, class.name, abstract.sysfile
			 FROM classes AS class
			 JOIN abstract ON abstract.id = class.id
			 WHERE class.id = $1
			 FOR UPDATE OF class`,
            values: [draft.ownerClassId],
            source: `Класс-владелец нового метода ${draft.ownerClassId}`,
            database: options.database,
        });
        const owner = ownerResult.rows[0];
        if (!owner) {
            throw new Error(`Класс ${draft.ownerClassId} не найден.`);
        }
        const developerRangeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT developer_range.id, developer_range.beginid, developer_range.endid,
			        developer_range.developername
			 FROM users AS session_user_row
			 JOIN developerids AS developer_range ON
			      developer_range.userid = session_user_row.id
			      OR (developer_range.userid IS NULL AND EXISTS (
			        SELECT 1
			        FROM developer
			        WHERE developer.id = developer_range.developerid
			          AND developer.name <> ''
			          AND regexp_replace(session_user_row.name, '^(ВЭ_|вэ_)', '') ILIKE developer.name || '%'
			      ))
			 WHERE session_user_row.id = $1
			 ORDER BY CASE WHEN developer_range.userid = session_user_row.id THEN 0 ELSE 1 END,
			          length(COALESCE(developer_range.developername, '')) DESC,
			          developer_range.beginid DESC
			 LIMIT 1`,
            values: [session.userId],
            source: 'Диапазон ID нового метода',
            database: options.database,
        });
        const range = developerRangeResult.rows[0];
        if (!range) {
            throw new Error(`Для пользователя ${session.userId} не найден диапазон DeveloperIDs.`);
        }
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT pg_advisory_xact_lock($1, $2)',
            values: [methodCreation_1.methodClassId, range.id],
            source: 'Блокировка генерации ID метода',
            database: options.database,
        });
        const duplicate = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT id FROM methods WHERE seniorid = $1 AND upper(name) = upper($2) LIMIT 1',
            values: [draft.ownerClassId, draft.name],
            source: 'Проверка имени нового метода',
            database: options.database,
        });
        if (duplicate.rowCount) {
            throw new Error(`В классе ${owner.name} уже есть метод ${draft.name}.`);
        }
        const visibility = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: 'SELECT id FROM enum WHERE id = $1 AND classid = 12450282',
            values: [draft.visibilityId],
            source: 'Проверка видимости нового метода',
            database: options.database,
        });
        if (visibility.rowCount !== 1) {
            throw new Error(`Область видимости ${draft.visibilityId} не найдена.`);
        }
        const idResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT afirstfreeid AS id
			 FROM oe_system_genguid_enum_ranges_v3(2147483647, $1::bigint, $2::bigint - $1::bigint + 1)
			 WHERE astartid = $1::bigint AND afirstfreeid <= $2::bigint
			 LIMIT 1`,
            values: [range.beginid, range.endid],
            source: 'Генерация ID нового метода',
            database: options.database,
        });
        const id = Number(idResult.rows[0]?.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new Error(`В диапазоне DeveloperIDs ${range.beginid}…${range.endid} нет свободного ID.`);
        }
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `INSERT INTO logcchangedobject
			 (objid, objclassid, changetype, newvalues, userid, computername, changedate,
			  oldvalues, transactioncomment, versionobject, rootobjid, rootobjclassid)
			 VALUES ($1, $2, 3, $3, $4, $5, $6, $7, '', '1899-12-30 00:00:00', $8, 3)`,
            values: [id, methodCreation_1.methodClassId, (0, methodCreation_1.encodeMethodCreationAuditValues)(draft), session.userId,
                session.computerName, session.changeDate, Buffer.alloc(0), draft.ownerClassId],
            source: `Логирование создания метода ${draft.name}`,
            database: options.database,
        });
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `INSERT INTO methods
			 (lastchange, name, visibility, methtype, methkind, signature, code, id, classid, seniorid)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            values: [session.changeDate, draft.name, draft.visibilityId, draft.methodType, draft.methodKind,
                encodedSignature, encodedCode, id, methodCreation_1.methodClassId, draft.ownerClassId],
            source: `Создание метода ${draft.name}`,
            database: options.database,
        });
        await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `INSERT INTO abstract (lastchange, name, id, classid, seniorid, sysfile)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
            values: [session.changeDate, draft.name, id, methodCreation_1.methodClassId, draft.ownerClassId, owner.sysfile],
            source: `Создание Abstract метода ${id}`,
            database: options.database,
        });
        const version = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `UPDATE classes
			 SET classversion = CASE
			   WHEN classversion = 2147483647 THEN -2147483648
			   ELSE COALESCE(classversion, 0) + 1
			 END
			 WHERE id = $1`,
            values: [draft.ownerClassId],
            source: `Обновление версии класса ${draft.ownerClassId}`,
            database: options.database,
        });
        if (version.rowCount !== 1) {
            throw new Error(`Класс ${draft.ownerClassId} исчез во время сохранения.`);
        }
        if (owner.sysfile !== null) {
            await markPackageFileChanged(client, options.database, owner.sysfile, session.userId, session.changeDate);
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
async function markPackageFileChanged(client, database, sysFileId, userId, changeDate) {
    const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `INSERT INTO syspackagebase
		 (objectid, objectclassid, objectseniorid, objectname, objectcontentmd5,
		  objectchangestate, objectchangelastdate, objectchangelastuser,
		  objectcontentrevision, objectpath, objectpathpackage)
		 SELECT file.id, file.classid, file_group.id, file.filename, COALESCE(file.contentmd5, ''),
		        2, $1, COALESCE(NULLIF(changed_user.name, ''), $2),
		        COALESCE(file.contentrevision, 0),
		        '\\' || trim(both '\\' from COALESCE(NULLIF(file_group.path, ''), file_group.name))
		          || '\\' || file.filename,
		        file_group.package
		 FROM sysfile AS file
		 JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		 LEFT JOIN abstract AS changed_user ON changed_user.id = $3
		 WHERE file.id = $4 AND file_group.package IS NOT NULL
		 ON CONFLICT (objectid) DO UPDATE
		 SET objectchangestate = 2`,
        values: [changeDate, String(userId), userId, sysFileId],
        source: `Регистрация изменения пакетного файла ${sysFileId}`,
        database,
    });
    if (result.rowCount !== 1) {
        throw new Error(`Файл ${sysFileId} не удалось зарегистрировать в списке синхронизации пакетов.`);
    }
}
function decodeCode(value) {
    if (Buffer.isBuffer(value)) {
        return iconv.decode(value, 'win1251');
    }
    const text = value === null || value === undefined ? '' : String(value);
    const bytea = text.match(/^\\x([\da-f]+)$/i);
    return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}
function isBinaryCodeType(codeType) {
    return codeType.toLocaleLowerCase('en-US') === 'bytea' || codeType.toLocaleLowerCase('en-US') === 'bin';
}
function encodeWindows1251(value) {
    const encoded = iconv.encode(value, 'win1251');
    if (iconv.decode(encoded, 'win1251') !== value) {
        throw new Error('Код содержит символы, которые невозможно сохранить в Cyrillic Windows-1251.');
    }
    return encoded;
}
/** Produces text that PostgreSQL can convert to WIN1251, including legacy audit values. */
function toWindows1251Text(value) {
    return iconv.decode(iconv.encode(value, 'win1251'), 'win1251');
}
function inspectValue(value) {
    const replacementCount = [...value].filter(character => character === '\uFFFD').length;
    const normalized = toWindows1251Text(value);
    return `chars=${value.length}, U+FFFD=${replacementCount}, WIN1251-roundtrip=${normalized === value}`;
}
//# sourceMappingURL=methodRepository.js.map