import { hostname } from 'node:os';
import type { PoolClient } from 'pg';
import * as iconv from 'iconv-lite';
import type { CreatedSpu, SpuDraft, SpuEditorOptions, SpuEditorRecord, SpuPackageOption, SpuTypeOption } from '../../features/spu/models';
import { buildSpuFileName, getAutomaticIdRangeStart, serializeSpuAuditChanges, serializeSpuAuditValues, spuClassId, sysFileClassId, validateSpuDraft } from '../../features/spu/spuCreation';
import { getSessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

interface PackageRow {
	id: number;
	name: string;
	groupid: number;
	version: number | null;
}

interface IdRow { id: number | string }
interface DeveloperRangeRow { id: number; beginid: number; endid: number }
interface SpuRow {
	id: number;
	name: string;
	executionorder: string;
	type: number;
	beginversion: number | null;
	isafterupdate: number | boolean | null;
	executealways: number | boolean | null;
	comment: unknown;
	sqlscript: unknown;
	fileid: number;
	packageid: number;
}

export async function getSpuEditorOptions(preferredPackageName?: string, spuId?: number): Promise<SpuEditorOptions> {
	return withProjectDatabaseSession(async ({ client, options }) => {
		const packagesResult = await executeMonitoredQuery<PackageRow>(client, {
			text: `SELECT package.id, package.packagename AS name, spu_group.id AS groupid, COALESCE(package.version, 0) AS version
			 FROM syspackages AS package
			 JOIN sysgroups AS spu_group ON spu_group.package = package.id
			  AND (lower(spu_group.name) = 'spu' OR lower(spu_group.path) = 'spu')
			 ORDER BY package.packagename`,
			values: [], source: 'Пакеты с группой SPU', database: options.database,
		});
		const typesResult = await executeMonitoredQuery<{ id: number; name: string }>(client, {
			text: 'SELECT id, name FROM abstract WHERE classid = $1 ORDER BY id',
			values: [10200540], source: 'Типы обновления пакета', database: options.database,
		});
		const packages: SpuPackageOption[] = packagesResult.rows.map(row => ({
			id: Number(row.id), name: row.name, groupId: Number(row.groupid), version: Number(row.version ?? 0),
		}));
		const types: SpuTypeOption[] = typesResult.rows.map(row => ({ id: Number(row.id), name: row.name }));
		const preferredPackageId = preferredPackageName
			? packages.find(item => item.name.localeCompare(preferredPackageName, 'ru', { sensitivity: 'base' }) === 0)?.id
			: undefined;
		const existing = spuId === undefined ? undefined : await loadSpuRecord(client, options.database, spuId);
		return { packages, types, preferredPackageId, executionOrder: toLocalDateTime(new Date()), existing };
	});
}

export async function createSpu(draft: SpuDraft, log: (message: string) => void = () => undefined): Promise<CreatedSpu> {
	validateSpuDraft(draft);
	const sqlScript = encodeWindows1251(draft.sqlScript, 'SQL-скрипт');
	const comment = encodeWindows1251(draft.comment, 'Комментарий');
	return withProjectDatabaseSession(async ({ client, options }) => {
	try {
		await client.query('BEGIN');
		const session = await getSessionContext(client, options.database);
		const localComputerName = hostname();
		const tuneResult = await executeMonitoredQuery<{ id: number }>(client, {
			text: `SELECT id FROM packagestune
			 WHERE upper(computername) = upper($1) OR upper(computername) LIKE upper($1) || '.%'
			 ORDER BY CASE WHEN upper(computername) = upper($1) THEN 0 ELSE 1 END LIMIT 1`,
			values: [localComputerName], source: 'Диапазон ID рабочей станции для SPU', database: options.database,
		});
		const automaticRangeStart = getAutomaticIdRangeStart(Number(tuneResult.rows[0]?.id));
		const developerRangeResult = await executeMonitoredQuery<DeveloperRangeRow>(client, {
			text: `SELECT developer_range.id, developer_range.beginid, developer_range.endid
			 FROM users AS current_user
			 JOIN users AS developer_user ON developer_user.person = current_user.person
			 JOIN developerids AS developer_range ON developer_range.userid = developer_user.id
			 WHERE current_user.id = $1
			 ORDER BY CASE WHEN developer_user.id = current_user.id THEN 0 ELSE 1 END, developer_range.beginid DESC
			 LIMIT 1`,
			values: [session.userId], source: 'Диапазон ID разработчика для SPU', database: options.database,
		});
		const developerRange = developerRangeResult.rows[0];
		if (!developerRange) { throw new Error(`Для пользователя ${session.userId} не найден диапазон DeveloperIDs.`); }
		await executeMonitoredQuery(client, {
			text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [spuClassId, developerRange.id],
			source: 'Блокировка генерации ID SPU', database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [sysFileClassId, automaticRangeStart],
			source: 'Блокировка генерации ID файла SPU', database: options.database,
		});

		const packageResult = await executeMonitoredQuery<PackageRow>(client, {
			text: `SELECT package.id, package.packagename AS name, spu_group.id AS groupid, COALESCE(package.version, 0) AS version
			 FROM syspackages AS package JOIN sysgroups AS spu_group ON spu_group.package = package.id
			 WHERE package.id = $1 AND (lower(spu_group.name) = 'spu' OR lower(spu_group.path) = 'spu')
			 ORDER BY spu_group.id LIMIT 1`,
			values: [draft.packageId], source: `Пакет нового SPU`, database: options.database,
		});
		const packageRow = packageResult.rows[0];
		if (!packageRow) { throw new Error('В выбранном пакете отсутствует группа SPU.'); }

		const fileName = buildSpuFileName(draft.name);
		const duplicateResult = await executeMonitoredQuery<{ id: number }>(client, {
			text: 'SELECT id FROM sysfile WHERE sysgroup = $1 AND lower(filename) = lower($2) LIMIT 1',
			values: [packageRow.groupid, fileName], source: 'Проверка имени пакетного файла SPU', database: options.database,
		});
		if (duplicateResult.rowCount) { throw new Error(`В пакете уже существует файл «${fileName}».`); }

		const id = await allocateDeveloperId(client, options.database, developerRange, 'SPU');
		const beginVersion = draft.versionControl ? draft.beginVersion : 0;
		const executionOrder = draft.executionOrder.replace('T', ' ');
		const shortName = draft.name.trim().slice(0, 32);
		await executeMonitoredQuery(client, {
			text: `INSERT INTO syspackageupdate
			 (id, classid, seniorid, name, ord, lastchange, executionorder, type, beginversion, isafterupdate, comment, sqlscript, executealways)
			 VALUES ($1, $2, NULL, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11)`,
			values: [id, spuClassId, draft.name.trim(), session.changeDate, executionOrder, draft.typeId, beginVersion,
				draft.isAfterUpdate ? -1 : null, comment, sqlScript, draft.executeAlways ? -1 : null],
			source: `Создание SPU ${draft.name.trim()}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'INSERT INTO abstract (lastchange, id, classid, name) VALUES ($1, $2, $3, $4)',
			values: [session.changeDate, id, spuClassId, shortName], source: `Создание Abstract SPU ${id}`, database: options.database,
		});

		const fileId = await allocateAutomaticId(client, options.database, automaticRangeStart, 'пакетного файла SPU');
		await executeMonitoredQuery(client, {
			text: `INSERT INTO sysfile
			 (lastchange, id, classid, filename, isautogroup, autogroup, version, comment, sysgroup, flags, author, attendauthor, crc, noupdate, name)
			 VALUES ($1, $2, $3, $4, -1, 'sysPackageUpdate', '', NULL, $5, NULL, '', '', NULL, 0, $6)`,
			values: [session.changeDate, fileId, sysFileClassId, fileName, packageRow.groupid, fileName.slice(0, 32)],
			source: `Создание файла ${fileName}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'INSERT INTO abstract (lastchange, id, classid, name) VALUES ($1, $2, $3, $4)',
			values: [session.changeDate, fileId, sysFileClassId, fileName.slice(0, 32)],
			source: `Создание Abstract файла SPU ${fileId}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'UPDATE abstract SET sysfile = $1 WHERE id = $2', values: [fileId, id],
			source: `Привязка SPU ${id} к файлу ${fileId}`, database: options.database,
		});

		const userResult = await executeMonitoredQuery<{ name: string }>(client, {
			text: 'SELECT name FROM abstract WHERE id = $1', values: [session.userId],
			source: 'Имя автора нового SPU', database: options.database,
		});
		const userName = userResult.rows[0]?.name?.trim() || String(session.userId);
		await executeMonitoredQuery(client, {
			text: `INSERT INTO syspackagebase
			 (objectid, objectclassid, objectseniorid, objectname, objectpath, objectpathpackage,
			  objectcontentmd5, objectcontentrevision, objectchangestate, objectchangelastdate, objectchangelastuser)
			 VALUES ($1, $2, $3, $4, $5, $6, '', 0, 2, $7, $8)`,
			values: [fileId, sysFileClassId, packageRow.groupid, fileName, `\\SPU\\${fileName}`, draft.packageId, session.changeDate, userName],
			source: `Регистрация файла SPU ${fileId} в пакете`, database: options.database,
		});

		await executeMonitoredQuery(client, {
			text: `INSERT INTO logcchangedobject
			 (objid, objclassid, changetype, newvalues, userid, computername, changedate, oldvalues,
			  transactioncomment, versionobject, rootobjid, rootobjclassid)
				 VALUES ($1, $2, 3, $3, $4, $5, $6, $7, $8, date_trunc('day', $6::timestamp), $1, $2)`,
			values: [id, spuClassId, encodeWindows1251(serializeSpuAuditValues(draft, beginVersion), 'Значения журнала'), session.userId, session.computerName,
				session.changeDate, Buffer.alloc(0), 'Сохранение объекта класса "sysPackageUpdate'],
			source: `Логирование создания SPU ${id}`, database: options.database,
		});

		await client.query('COMMIT');
		log(`SPU ${id} и пакетный файл ${fileId} созданы.`);
		return { id, fileId, name: draft.name.trim(), packageId: draft.packageId };
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		log(`Создание SPU отменено: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
	});
}

export async function updateSpu(id: number, draft: SpuDraft, log: (message: string) => void = () => undefined): Promise<CreatedSpu> {
	if (!Number.isSafeInteger(id) || id <= 0) { throw new Error('Указан некорректный ID SPU.'); }
	validateSpuDraft(draft);
	const sqlScript = encodeWindows1251(draft.sqlScript, 'SQL-скрипт');
	const comment = encodeWindows1251(draft.comment, 'Комментарий');
	return withProjectDatabaseSession(async ({ client, options }) => {
	try {
		await client.query('BEGIN');
		const current = await loadSpuRecord(client, options.database, id, true);
		const session = await getSessionContext(client, options.database);
		const packageResult = await executeMonitoredQuery<PackageRow>(client, {
			text: `SELECT package.id, package.packagename AS name, spu_group.id AS groupid, COALESCE(package.version, 0) AS version
			 FROM syspackages AS package JOIN sysgroups AS spu_group ON spu_group.package = package.id
			 WHERE package.id = $1 AND (lower(spu_group.name) = 'spu' OR lower(spu_group.path) = 'spu')
			 ORDER BY spu_group.id LIMIT 1`,
			values: [draft.packageId], source: `Пакет редактируемого SPU ${id}`, database: options.database,
		});
		const packageRow = packageResult.rows[0];
		if (!packageRow) { throw new Error('В выбранном пакете отсутствует группа SPU.'); }

		const fileName = buildSpuFileName(draft.name);
		const duplicateResult = await executeMonitoredQuery<{ id: number }>(client, {
			text: 'SELECT id FROM sysfile WHERE sysgroup = $1 AND lower(filename) = lower($2) AND id <> $3 LIMIT 1',
			values: [packageRow.groupid, fileName, current.fileId], source: 'Проверка имени файла редактируемого SPU', database: options.database,
		});
		if (duplicateResult.rowCount) { throw new Error(`В пакете уже существует файл «${fileName}».`); }

		const beginVersion = draft.versionControl ? draft.beginVersion : 0;
		const previousBeginVersion = current.draft.versionControl ? current.draft.beginVersion : 0;
		const audit = serializeSpuAuditChanges(current.draft, draft, previousBeginVersion, beginVersion);
		const packageFileChanged = current.name !== draft.name.trim() || current.packageId !== draft.packageId;
		if (!audit.newValues && !packageFileChanged) {
			await client.query('ROLLBACK');
			log(`SPU ${id} не изменён.`);
			return { id, fileId: current.fileId, name: current.name, packageId: current.packageId };
		}
		const executionOrder = draft.executionOrder.replace('T', ' ');
		const shortName = draft.name.trim().slice(0, 32);
		await executeMonitoredQuery(client, {
			text: `UPDATE syspackageupdate SET name = $1, lastchange = $2, executionorder = $3, type = $4,
			 beginversion = $5, isafterupdate = $6, comment = $7, sqlscript = $8, executealways = $9 WHERE id = $10`,
			values: [draft.name.trim(), session.changeDate, executionOrder, draft.typeId, beginVersion,
				draft.isAfterUpdate ? -1 : null, comment, sqlScript, draft.executeAlways ? -1 : null, id],
			source: `Сохранение SPU ${id}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'UPDATE abstract SET lastchange = $1, name = $2 WHERE id = $3',
			values: [session.changeDate, shortName, id], source: `Сохранение Abstract SPU ${id}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: `UPDATE sysfile SET lastchange = $1, filename = $2, sysgroup = $3, name = $4 WHERE id = $5`,
			values: [session.changeDate, fileName, packageRow.groupid, fileName.slice(0, 32), current.fileId],
			source: `Сохранение файла SPU ${current.fileId}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'UPDATE abstract SET lastchange = $1, name = $2 WHERE id = $3',
			values: [session.changeDate, fileName.slice(0, 32), current.fileId], source: `Сохранение Abstract файла SPU ${current.fileId}`, database: options.database,
		});

		const userResult = await executeMonitoredQuery<{ name: string }>(client, {
			text: 'SELECT name FROM abstract WHERE id = $1', values: [session.userId],
			source: 'Имя автора изменения SPU', database: options.database,
		});
		const userName = userResult.rows[0]?.name?.trim() || String(session.userId);
		const packageBaseResult = await executeMonitoredQuery(client, {
			text: `UPDATE syspackagebase SET objectseniorid = $1, objectname = $2, objectpath = $3,
			 objectpathpackage = $4, objectchangestate = 1, objectchangelastdate = $5, objectchangelastuser = $6
			 WHERE objectid = $7`,
			values: [packageRow.groupid, fileName, `\\SPU\\${fileName}`, draft.packageId, session.changeDate, userName, current.fileId],
			source: `Регистрация изменения файла SPU ${current.fileId}`, database: options.database,
		});
		if (packageBaseResult.rowCount !== 1) { throw new Error(`Пакетный файл SPU ${current.fileId} не зарегистрирован в SysPackageBase.`); }

		if (audit.newValues) {
			await executeMonitoredQuery(client, {
				text: `INSERT INTO logcchangedobject
				 (objid, objclassid, changetype, newvalues, userid, computername, changedate, oldvalues,
				  transactioncomment, versionobject, rootobjid, rootobjclassid)
				 VALUES ($1, $2, 2, $3, $4, $5, $6, $7, $8, date_trunc('day', $6::timestamp), $1, $2)`,
				values: [id, spuClassId, encodeWindows1251(audit.newValues, 'Новые значения журнала'), session.userId,
					session.computerName, session.changeDate, encodeWindows1251(audit.oldValues, 'Старые значения журнала'),
					'Сохранение объекта класса "sysPackageUpdate'],
				source: `Логирование изменения SPU ${id}`, database: options.database,
			});
		}

		await client.query('COMMIT');
		log(`SPU ${id} и пакетный файл ${current.fileId} сохранены.`);
		return { id, fileId: current.fileId, name: draft.name.trim(), packageId: draft.packageId };
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		log(`Сохранение SPU ${id} отменено: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
	});
}

async function loadSpuRecord(client: PoolClient, database: string, id: number, forUpdate = false): Promise<SpuEditorRecord> {
	const result = await executeMonitoredQuery<SpuRow>(client, {
		text: `SELECT spu.id, spu.name, to_char(spu.executionorder, 'YYYY-MM-DD"T"HH24:MI:SS') AS executionorder,
		        spu.type, COALESCE(spu.beginversion, 0) AS beginversion, spu.isafterupdate, spu.executealways,
		        spu.comment, spu.sqlscript, object.sysfile AS fileid, file_group.package AS packageid
		 FROM syspackageupdate AS spu
		 JOIN abstract AS object ON object.id = spu.id AND object.classid = $2
		 JOIN sysfile AS file ON file.id = object.sysfile
		 JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		 WHERE spu.id = $1${forUpdate ? ' FOR UPDATE OF spu' : ''}`,
		values: [id, spuClassId], source: `Загрузка SPU ${id}`, database,
	});
	const row = result.rows[0];
	if (!row) { throw new Error(`SPU ${id} не найден.`); }
	const beginVersion = Number(row.beginversion ?? 0);
	return {
		id: Number(row.id), fileId: Number(row.fileid), name: row.name, packageId: Number(row.packageid),
		draft: {
			name: row.name ?? '', packageId: Number(row.packageid), typeId: Number(row.type),
			executionOrder: row.executionorder, versionControl: beginVersion > 0, beginVersion,
			isAfterUpdate: toBoolean(row.isafterupdate), executeAlways: toBoolean(row.executealways),
			comment: decodeWindows1251(row.comment), sqlScript: decodeWindows1251(row.sqlscript),
		},
	};
}

async function allocateAutomaticId(client: PoolClient, database: string, rangeStart: number, purpose: string): Promise<number> {
	const result = await executeMonitoredQuery<IdRow>(client, {
		text: `SELECT afirstfreeid AS id
		 FROM OE_SYSTEM_GENGUID_ENUM_RANGES_V3(2147483647, 20000001, 1000000)
		 WHERE astartid = $1 AND afirstfreeid < aendid LIMIT 1`,
		values: [rangeStart], source: `Генерация ID ${purpose}`, database,
	});
	const id = Number(result.rows[0]?.id);
	if (!Number.isSafeInteger(id) || id <= 0) { throw new Error(`В диапазоне ${rangeStart} нет свободного ID для ${purpose}.`); }
	return id;
}

async function allocateDeveloperId(client: PoolClient, database: string, range: DeveloperRangeRow, purpose: string): Promise<number> {
	const result = await executeMonitoredQuery<IdRow>(client, {
		text: `SELECT candidate AS id
		 FROM generate_series($1::integer, $2::integer) AS candidate
		 WHERE NOT EXISTS (SELECT 1 FROM abstract WHERE id = candidate)
		 ORDER BY candidate LIMIT 1`,
		values: [range.beginid, range.endid], source: `Генерация ID ${purpose} из DeveloperIDs`, database,
	});
	const id = Number(result.rows[0]?.id);
	if (!Number.isSafeInteger(id) || id <= 0) { throw new Error(`В диапазоне DeveloperIDs ${range.beginid}…${range.endid} нет свободного ID.`); }
	return id;
}

function encodeWindows1251(value: string, label: string): Buffer {
	const encoded = iconv.encode(value, 'win1251');
	if (iconv.decode(encoded, 'win1251') !== value) { throw new Error(`${label} содержит символы вне Windows-1251.`); }
	return encoded;
}

function decodeWindows1251(value: unknown): string {
	if (Buffer.isBuffer(value)) { return iconv.decode(value, 'win1251'); }
	const text = value === null || value === undefined ? '' : String(value);
	const bytea = text.match(/^\\x([\da-f]+)$/i);
	return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}

function toBoolean(value: number | boolean | null): boolean {
	return value === true || Number(value) !== 0;
}

function toLocalDateTime(value: Date): string {
	const offset = value.getTimezoneOffset() * 60_000;
	return new Date(value.getTime() - offset).toISOString().slice(0, 19);
}
