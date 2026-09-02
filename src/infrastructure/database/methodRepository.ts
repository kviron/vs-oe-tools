import { Client } from 'pg';
import * as iconv from 'iconv-lite';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { getSessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { serializeChangeValues } from './changeValuesSerialization';

export interface MethodSource {
	id: number;
	name: string;
	seniorId: number;
	methodType: number | null;
	code: string;
	codeType: string;
}

interface MethodSourceRow {
	id: number;
	name: string;
	seniorid: number;
	methtype: number | null;
	code: unknown;
	codetype: string;
}

export async function getMethodSource(id: number): Promise<MethodSource> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<MethodSourceRow, [number]>(client, {
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
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function saveMethodSource(method: MethodSource, code: string): Promise<void> {
	const encoded = encodeWindows1251(code);
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		await client.query('BEGIN');

		// Получаем старый код перед обновлением
		const oldCodeResult = await executeMonitoredQuery<MethodSourceRow, [number]>(client, {
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
		const oldCodeValue = method.codeType === 'bytea' ? decodeCode(oldCodeRow.code) : String(oldCodeRow.code ?? '');

		// Сравниваем старый и новый код
		if (oldCodeValue === code) {
			// Код не изменился, откатываем транзакцию и выходим
			await client.query('ROLLBACK');
			return;
		}

		// Получаем контекст сессии (UserID, ComputerName, ChangeDate)
		const sessionContext = await getSessionContext(client, options.database);

		// Выполняем обновление методов
		const lastChange = sessionContext.changeDate;
		const codeValue = method.codeType === 'bytea' ? encoded : code;

		const methodResult = await executeMonitoredQuery(client, {
			text: `UPDATE methods
			 SET lastchange = $1, code = $2, seniorid = $3
			 WHERE id = $4`,
			values: [lastChange, codeValue, method.seniorId, method.id],
			source: `Сохранение метода ${method.name}`,
			database: options.database,
		});

		if (methodResult.rowCount !== 1) {
			throw new Error(`Метод ${method.id} не найден при сохранении.`);
		}

		// Обновляем abstract
		const abstractResult = await executeMonitoredQuery(client, {
			text: `UPDATE abstract
			 SET lastchange = $1, seniorid = $2
			 WHERE id = $3`,
			values: [lastChange, method.seniorId, method.id],
			source: `Сохранение abstract метода ${method.name}`,
			database: options.database,
		});

		if (abstractResult.rowCount !== 1) {
			throw new Error(`Запись abstract ${method.id} не найдена при сохранении.`);
		}

		// Формируем NewValues и OldValues для LogCChangedObject
		const newValues = serializeChangeValues(code, method.seniorId);
		const oldValues = serializeChangeValues(oldCodeValue, method.seniorId);

		// Вставляем запись в LogCChangedObject
		const logResult = await executeMonitoredQuery(client, {
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
				method.id,           // ObjID - ID метода
				5,                   // ObjClassID - класс метода
				2,                   // ChangeType - изменение существующего объекта
				newValues,           // NewValues - сериализованные новые значения
				sessionContext.userId, // UserID - ID пользователя
				sessionContext.computerName, // ComputerName - имя компьютера
				lastChange,          // ChangeDate - дата изменения
				oldValues,           // OldValues - сериализованные старые значения
				'',                  // TransactionComment - пустой комментарий
				new Date('1899-12-30'), // VersionObject - нулевая дата (версия объекта)
				method.seniorId,     // RootObjID - ID родительского класса (SeniorID)
				3,                   // RootObjClassID - класс класса
			],
			source: `Логирование изменения метода ${method.name}`,
			database: options.database,
		});

		if (logResult.rowCount !== 1) {
			throw new Error(`Ошибка при записи в LogCChangedObject для метода ${method.id}.`);
		}

		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		await client.end().catch(() => undefined);
	}
}

function decodeCode(value: unknown): string {
	if (Buffer.isBuffer(value)) {
		return iconv.decode(value, 'win1251');
	}
	const text = value === null || value === undefined ? '' : String(value);
	const bytea = text.match(/^\\x([\da-f]+)$/i);
	return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}

function encodeWindows1251(value: string): Buffer {
	const encoded = iconv.encode(value, 'win1251');
	if (iconv.decode(encoded, 'win1251') !== value) {
		throw new Error('Код содержит символы, которые невозможно сохранить в Cyrillic Windows-1251.');
	}
	return encoded;
}
