import { Client } from 'pg';
import * as iconv from 'iconv-lite';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { getSessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { serializeChangeValues } from './changeValuesSerialization';
import { resolveMethodSignature } from './methodSignature';
import type { ClassMethodDraft, CreatedClassMethod } from '../../features/classes/models';
import {
	encodeMethodCreationAuditValues,
	methodClassId,
	normalizeClassMethodDraft,
	validateClassMethodDraft,
} from '../../features/methods/methodCreation';

export interface MethodSource {
	id: number;
	name: string;
	seniorId: number;
	methodType: number | null;
	signature: string;
	signatureType: string;
	code: string;
	codeType: string;
}

interface MethodSourceRow {
	id: number;
	name: string;
	seniorid: number;
	methtype: number | null;
	signature: unknown;
	signaturetype: string;
	code: unknown;
	codetype: string;
	sysfile?: number | null;
}

interface MethodOwnerRow { id: number; name: string; sysfile: number | null; }
interface DeveloperRangeRow { id: number; beginid: number; endid: number; }
interface IdRow { id: number; }

export interface MethodReference {
	id: number;
	name: string;
	seniorId: number;
}

export async function findMethodsByName(name: string): Promise<MethodReference[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<{ id: number; name: string; seniorid: number }, [string]>(client, {
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
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function getMethodSource(id: number): Promise<MethodSource> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<MethodSourceRow, [number]>(client, {
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
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function saveMethodSource(method: MethodSource, code: string, log: (message: string) => void = () => undefined): Promise<void> {
	log(`Старт сохранения ID=${method.id}; codeType=${method.codeType}; ${inspectValue(code)}.`);
	const encoded = encodeWindows1251(code);
	log(`Новый код проверен и закодирован в WIN1251: bytes=${encoded.byteLength}.`);
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		log(`Подключение к БД ${options.database} установлено.`);
		await client.query('BEGIN');
		log('Транзакция BEGIN.');

		// Получаем старый код перед обновлением
		const oldCodeResult = await executeMonitoredQuery<MethodSourceRow, [number]>(client, {
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
		const nextSignature = resolveMethodSignature(oldCodeValue, code, oldSignature);
		log(`Старый код прочитан: ${inspectValue(oldCodeValue)}.`);
		log(`Сигнатура метода: старая=${JSON.stringify(oldSignature)}; новая=${JSON.stringify(nextSignature)}.`);

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
		const codeValue = isBinaryCodeType(method.codeType) ? encoded : code;
		const signatureValue = isBinaryCodeType(oldCodeRow.signaturetype)
			? encodeWindows1251(nextSignature)
			: nextSignature;

		const methodResult = await executeMonitoredQuery(client, {
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
		const abstractResult = await executeMonitoredQuery(client, {
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
		const newValues = toWindows1251Text(serializeChangeValues(code, method.seniorId, nextSignature));
		const oldValues = toWindows1251Text(serializeChangeValues(oldCodeValue, method.seniorId, oldSignature));
		log(`Значения аудита подготовлены: NewValues ${inspectValue(newValues)}; OldValues ${inspectValue(oldValues)}.`);

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
				'1899-12-30 00:00:00', // Строка обязательна: JS Date искажает историческую дату часовым поясом.
				method.seniorId,     // RootObjID - ID родительского класса (SeniorID)
				3,                   // RootObjClassID - класс класса
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
		const classVersionResult = await executeMonitoredQuery(client, {
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
			const packageResult = await executeMonitoredQuery(client, {
				text: `UPDATE syspackagebase
				 SET objectchangestate = 2
				 WHERE objectid = $1`,
				values: [sysFileId],
				source: `Отметка пакетного файла ${sysFileId} изменённым`,
				database: options.database,
			});
			log(`UPDATE SysPackageBase.ObjectChangeState выполнен: objectId=${sysFileId}; rowCount=${packageResult.rowCount}.`);
		}

		await client.query('COMMIT');
		method.signature = nextSignature;
		log('Транзакция COMMIT.');
	} catch (error) {
		log(`Ошибка SQL-этапа: ${error instanceof Error ? error.message : String(error)}.`);
		await client.query('ROLLBACK').catch(() => undefined);
		log('Транзакция ROLLBACK.');
		throw error;
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function createClassMethod(input: ClassMethodDraft): Promise<CreatedClassMethod> {
	validateClassMethodDraft(input);
	const draft = normalizeClassMethodDraft(input);
	const encodedSignature = encodeWindows1251(draft.signature);
	const encodedCode = encodeWindows1251(draft.code);
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		await client.query('BEGIN');
		const session = await getSessionContext(client, options.database);
		const ownerResult = await executeMonitoredQuery<MethodOwnerRow>(client, {
			text: `SELECT class.id,class.name,abstract.sysfile FROM classes AS class
			 JOIN abstract ON abstract.id=class.id WHERE class.id=$1 FOR UPDATE OF class`,
			values: [draft.ownerClassId], source: `Класс-владелец нового метода ${draft.ownerClassId}`, database: options.database,
		});
		const owner = ownerResult.rows[0];
		if (!owner) { throw new Error(`Класс ${draft.ownerClassId} не найден.`); }

		const developerRangeResult = await executeMonitoredQuery<DeveloperRangeRow>(client, {
			text: `SELECT developer_range.id, developer_range.beginid, developer_range.endid
			 FROM users AS session_user_row
			 JOIN users AS developer_user ON developer_user.person = session_user_row.person
			 JOIN developerids AS developer_range ON developer_range.userid = developer_user.id
			 WHERE session_user_row.id = $1
			 ORDER BY CASE WHEN developer_user.id = session_user_row.id THEN 0 ELSE 1 END, developer_range.beginid DESC
			 LIMIT 1`,
			values: [session.userId], source: 'Диапазон ID нового метода', database: options.database,
		});
		const range = developerRangeResult.rows[0];
		if (!range) { throw new Error(`Для пользователя ${session.userId} не найден диапазон DeveloperIDs.`); }
		await executeMonitoredQuery(client, {
			text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [methodClassId, range.id],
			source: 'Блокировка генерации ID метода', database: options.database,
		});
		const duplicate = await executeMonitoredQuery<IdRow>(client, {
			text: 'SELECT id FROM methods WHERE seniorid=$1 AND upper(name)=upper($2) LIMIT 1',
			values: [draft.ownerClassId, draft.name], source: 'Проверка имени нового метода', database: options.database,
		});
		if (duplicate.rowCount) { throw new Error(`В классе ${owner.name} уже есть метод ${draft.name}.`); }
		const visibility = await executeMonitoredQuery<IdRow>(client, {
			text: 'SELECT id FROM enum WHERE id=$1 AND classid=12450282', values: [draft.visibilityId],
			source: 'Проверка видимости нового метода', database: options.database,
		});
		if (visibility.rowCount !== 1) { throw new Error(`Область видимости ${draft.visibilityId} не найдена.`); }
		const idResult = await executeMonitoredQuery<IdRow>(client, {
			text: `SELECT candidate AS id FROM generate_series($1::integer, $2::integer) AS candidate
			 WHERE NOT EXISTS (SELECT 1 FROM abstract WHERE id=candidate) ORDER BY candidate LIMIT 1`,
			values: [range.beginid, range.endid], source: 'Генерация ID нового метода', database: options.database,
		});
		const id = Number(idResult.rows[0]?.id);
		if (!Number.isSafeInteger(id) || id <= 0) { throw new Error(`В диапазоне DeveloperIDs ${range.beginid}…${range.endid} нет свободного ID.`); }

		await executeMonitoredQuery(client, {
			text: `INSERT INTO logcchangedobject
			 (objid,objclassid,changetype,newvalues,userid,computername,changedate,oldvalues,transactioncomment,versionobject,rootobjid,rootobjclassid)
			 VALUES ($1,$2,3,$3,$4,$5,$6,$7,'','1899-12-30 00:00:00',$8,3)`,
			values: [id, methodClassId, encodeMethodCreationAuditValues(draft), session.userId, session.computerName,
				session.changeDate, Buffer.alloc(0), draft.ownerClassId],
			source: `Логирование создания метода ${draft.name}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: `INSERT INTO methods
			 (lastchange,name,visibility,methtype,methkind,signature,code,id,classid,seniorid)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			values: [session.changeDate, draft.name, draft.visibilityId, draft.methodType, draft.methodKind,
				encodedSignature, encodedCode, id, methodClassId, draft.ownerClassId],
			source: `Создание метода ${draft.name}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'INSERT INTO abstract (lastchange,name,id,classid,seniorid,sysfile) VALUES ($1,$2,$3,$4,$5,$6)',
			values: [session.changeDate, draft.name, id, methodClassId, draft.ownerClassId, owner.sysfile],
			source: `Создание Abstract метода ${id}`, database: options.database,
		});
		const version = await executeMonitoredQuery(client, {
			text: `UPDATE classes SET classversion=CASE WHEN classversion=2147483647 THEN -2147483648
			 ELSE COALESCE(classversion,0)+1 END WHERE id=$1`,
			values: [draft.ownerClassId], source: `Обновление версии класса ${draft.ownerClassId}`, database: options.database,
		});
		if (version.rowCount !== 1) { throw new Error(`Класс ${draft.ownerClassId} исчез во время сохранения.`); }
		if (owner.sysfile !== null) {
			await executeMonitoredQuery(client, {
				text: 'UPDATE syspackagebase SET objectchangestate=2 WHERE objectid=$1', values: [owner.sysfile],
				source: `Отметка пакетного файла ${owner.sysfile} изменённым`, database: options.database,
			});
		}
		await client.query('COMMIT');
		return { id, ownerClassId: draft.ownerClassId, name: draft.name };
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

function isBinaryCodeType(codeType: string): boolean {
	return codeType.toLocaleLowerCase('en-US') === 'bytea' || codeType.toLocaleLowerCase('en-US') === 'bin';
}

function encodeWindows1251(value: string): Buffer {
	const encoded = iconv.encode(value, 'win1251');
	if (iconv.decode(encoded, 'win1251') !== value) {
		throw new Error('Код содержит символы, которые невозможно сохранить в Cyrillic Windows-1251.');
	}
	return encoded;
}

/** Produces text that PostgreSQL can convert to WIN1251, including legacy audit values. */
function toWindows1251Text(value: string): string {
	return iconv.decode(iconv.encode(value, 'win1251'), 'win1251');
}

function inspectValue(value: string): string {
	const replacementCount = [...value].filter(character => character === '\uFFFD').length;
	const normalized = toWindows1251Text(value);
	return `chars=${value.length}, U+FFFD=${replacementCount}, WIN1251-roundtrip=${normalized === value}`;
}
