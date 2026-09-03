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
const pg_1 = require("pg");
const iconv = __importStar(require("iconv-lite"));
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const sessionContext_1 = require("../configuration/sessionContext");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
const changeValuesSerialization_1 = require("./changeValuesSerialization");
async function findMethodsByName(name) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
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
async function getMethodSource(id) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT method.id, method.name, method.seniorid, method.methtype,
			        method.code, pg_typeof(method.code)::text AS codetype
			 FROM methods AS method
			 WHERE method.id = $1`,
            values: [id], source: `Код метода ${id}`, database: options.database,
        });
        const row = result.rows[0];
        if (!row) {
            throw new Error(`Метод ${id} не найден в базе.`);
        }
        return { id: row.id, name: row.name, seniorId: row.seniorid, methodType: row.methtype, code: decodeCode(row.code), codeType: row.codetype };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function saveMethodSource(method, code, log = () => undefined) {
    log(`Старт сохранения ID=${method.id}; codeType=${method.codeType}; ${inspectValue(code)}.`);
    const encoded = encodeWindows1251(code);
    log(`Новый код проверен и закодирован в WIN1251: bytes=${encoded.byteLength}.`);
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        log(`Подключение к БД ${options.database} установлено.`);
        await client.query('BEGIN');
        log('Транзакция BEGIN.');
        // Получаем старый код перед обновлением
        const oldCodeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT method.code, pg_typeof(method.code)::text AS codetype
			 FROM methods AS method
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
        log(`Старый код прочитан: ${inspectValue(oldCodeValue)}.`);
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
        const methodResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `UPDATE methods
			 SET lastchange = $1, code = $2, seniorid = $3
			 WHERE id = $4`,
            values: [lastChange, codeValue, method.seniorId, method.id],
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
        const newValues = toWindows1251Text((0, changeValuesSerialization_1.serializeChangeValues)(code, method.seniorId));
        const oldValues = toWindows1251Text((0, changeValuesSerialization_1.serializeChangeValues)(oldCodeValue, method.seniorId));
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
                new Date('1899-12-30'), // VersionObject - нулевая дата (версия объекта)
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
        await client.query('COMMIT');
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