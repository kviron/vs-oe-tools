import type { PoolClient } from 'pg';
import * as iconv from 'iconv-lite';
import type { DatabaseConnectionOptions } from '../../core/database';
import { getSessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

export const moduleClassId = 33;
export const moduleCodeAttributeId = 180;

export interface ModuleSource {
	id: number;
	name: string;
	seniorId: number;
	ownerClassId: number;
	code: string;
	codeType: string;
}

interface ModuleSourceRow {
	id: number;
	name: string;
	seniorid: number;
	ownerclassid: number;
	code: unknown;
	codetype: string;
	sysfile?: number | null;
	ownersysfile?: number | null;
	hassyncstate?: boolean;
}

export async function getModuleSource(id: number, databaseOptions?: DatabaseConnectionOptions): Promise<ModuleSource> {
	return withProjectDatabaseSession(async ({ client, options }) => {
		const result = await executeMonitoredQuery<ModuleSourceRow, [number, number]>(client, {
			text: `SELECT module.id, COALESCE(NULLIF(module.name, ''), NULLIF(owner.name, ''), 'Модуль ' || module.id::text) AS name,
			        module.seniorid, owner.classid AS ownerclassid,
			        module.code, pg_typeof(module.code)::text AS codetype
			 FROM modules AS module
			 JOIN abstract AS object ON object.id = module.id AND object.classid = $2
			 JOIN abstract AS owner ON owner.id = module.seniorid
			 WHERE module.id = $1`,
			values: [id, moduleClassId], source: `Код модуля ${id}`, database: options.database,
		});
		const row = result.rows[0];
		if (!row) { throw new Error(`Модуль ${id} не найден в базе.`); }
		return mapModule(row);
	}, databaseOptions);
}

export async function saveModuleSource(
	module: ModuleSource,
	code: string,
	log: (message: string) => void = () => undefined,
	databaseOptions?: DatabaseConnectionOptions,
): Promise<void> {
	const encoded = encodeWindows1251(code);
	return withProjectDatabaseSession(async ({ client, options }) => {
		try {
			await client.query('BEGIN');
			const currentResult = await executeMonitoredQuery<ModuleSourceRow, [number, number]>(client, {
				text: `SELECT module.id, COALESCE(NULLIF(module.name, ''), NULLIF(owner.name, ''), 'Модуль ' || module.id::text) AS name,
				        module.seniorid, owner.classid AS ownerclassid,
				        module.code, pg_typeof(module.code)::text AS codetype,
				        object.sysfile, owner.sysfile AS ownersysfile,
				        EXISTS (SELECT 1 FROM syspackagebase WHERE objectid = COALESCE(object.sysfile, owner.sysfile)) AS hassyncstate
				 FROM modules AS module
				 JOIN abstract AS object ON object.id = module.id AND object.classid = $2
				 JOIN abstract AS owner ON owner.id = module.seniorid
				 WHERE module.id = $1
				 FOR UPDATE OF module, object`,
				values: [module.id, moduleClassId], source: `Получение старого кода модуля ${module.id}`, database: options.database,
			});
			const currentRow = currentResult.rows[0];
			if (!currentRow) { throw new Error(`Модуль ${module.id} не найден при сохранении.`); }
			const current = mapModule(currentRow);
			const sysFileId = currentRow.sysfile ?? currentRow.ownersysfile;
			if (!sysFileId) { throw new Error(`Модуль ${module.id} и его владелец не привязаны к пакетному файлу.`); }
			const needsBinding = currentRow.sysfile === null || currentRow.sysfile === undefined;
			if (current.code === code && !needsBinding && currentRow.hassyncstate) {
				await client.query('ROLLBACK');
				return;
			}
			const session = await getSessionContext(client, options.database);
			if (needsBinding) {
				await executeMonitoredQuery(client, {
					text: 'UPDATE abstract SET sysfile = $1 WHERE id = $2 AND sysfile IS NULL',
					values: [sysFileId, module.id], source: `Привязка модуля ${module.id} к файлу владельца`, database: options.database,
				});
			}
			if (current.code !== code) {
				const codeValue = isBinaryCodeType(current.codeType) ? encoded : code;
				const update = await executeMonitoredQuery(client, {
					text: 'UPDATE modules SET lastchange = $1, code = $2, seniorid = $3 WHERE id = $4',
					values: [session.changeDate, codeValue, current.seniorId, current.id], source: `Сохранение модуля ${current.name}`, database: options.database,
				});
				if (update.rowCount !== 1) { throw new Error(`Модуль ${module.id} исчез во время сохранения.`); }
				const abstractUpdate = await executeMonitoredQuery(client, {
					text: 'UPDATE abstract SET lastchange = $1, seniorid = $2 WHERE id = $3',
					values: [session.changeDate, current.seniorId, current.id], source: `Сохранение Abstract модуля ${current.id}`, database: options.database,
				});
				if (abstractUpdate.rowCount !== 1) { throw new Error(`Abstract модуля ${module.id} исчез во время сохранения.`); }
				const audit = await executeMonitoredQuery(client, {
					text: `INSERT INTO logcchangedobject
					 (objid, objclassid, changetype, newvalues, userid, computername, changedate,
					  oldvalues, transactioncomment, versionobject, rootobjid, rootobjclassid)
					 VALUES ($1, $2, 2, $3, $4, $5, $6, $7, '', '1899-12-30 00:00:00', $8, $9)`,
					values: [current.id, moduleClassId, encodeAuditValue(code), session.userId, session.computerName,
						session.changeDate, encodeAuditValue(current.code), current.seniorId, current.ownerClassId],
					source: `Логирование изменения модуля ${current.name}`, database: options.database,
				});
				if (audit.rowCount !== 1) { throw new Error(`Не удалось записать аудит модуля ${module.id}.`); }
			}
			await markPackageFileChanged(client, options.database, Number(sysFileId), session.userId, session.changeDate);
			await client.query('COMMIT');
			log(`Модуль ${module.id} сохранён; SysFile ${sysFileId}.`);
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw error;
		}
	}, databaseOptions);
}

function mapModule(row: ModuleSourceRow): ModuleSource {
	return { id: Number(row.id), name: row.name, seniorId: Number(row.seniorid), ownerClassId: Number(row.ownerclassid),
		code: decodeWindows1251(row.code), codeType: row.codetype };
}

function encodeAuditValue(code: string): string {
	return decodeWindows1251(iconv.encode(`${moduleCodeAttributeId},"${code.replace(/"/gu, '""')}"`, 'win1251'));
}

function decodeWindows1251(value: unknown): string {
	if (Buffer.isBuffer(value)) { return iconv.decode(value, 'win1251'); }
	const text = value === null || value === undefined ? '' : String(value);
	const bytea = text.match(/^\\x([\da-f]+)$/iu);
	return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}

function encodeWindows1251(value: string): Buffer {
	const encoded = iconv.encode(value, 'win1251');
	if (iconv.decode(encoded, 'win1251') !== value) {
		throw new Error('Код содержит символы, которые невозможно сохранить в Cyrillic Windows-1251.');
	}
	return encoded;
}

function isBinaryCodeType(type: string): boolean { return ['bytea', 'bin', 'blob'].includes(type.toLocaleLowerCase('en-US')); }

async function markPackageFileChanged(client: PoolClient, database: string, sysFileId: number, userId: number, changeDate: Date): Promise<void> {
	const result = await executeMonitoredQuery(client, {
		text: `INSERT INTO syspackagebase
		 (objectid, objectclassid, objectseniorid, objectname, objectcontentmd5,
		  objectchangestate, objectchangelastdate, objectchangelastuser,
		  objectcontentrevision, objectpath, objectpathpackage)
		 SELECT file.id, file.classid, file_group.id, file.filename, COALESCE(file.contentmd5, ''),
		        2, $1, COALESCE(NULLIF(changed_user.name, ''), $2), COALESCE(file.contentrevision, 0),
		        '\\' || trim(both '\\' from COALESCE(NULLIF(file_group.path, ''), file_group.name)) || '\\' || file.filename,
		        file_group.package
		 FROM sysfile AS file
		 JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		 LEFT JOIN abstract AS changed_user ON changed_user.id = $3
		 WHERE file.id = $4 AND file_group.package IS NOT NULL
		   AND NULLIF(file.filename, '') IS NOT NULL AND lower(file.filename) NOT IN ('#package$', '#package$.pkf')
		 ON CONFLICT (objectid) DO UPDATE
		 SET objectchangestate = 2, objectchangelastdate = EXCLUDED.objectchangelastdate,
		     objectchangelastuser = EXCLUDED.objectchangelastuser`,
		values: [changeDate, String(userId), userId, sysFileId], source: `Регистрация изменения пакетного файла ${sysFileId}`, database,
	});
	if (result.rowCount !== 1) { throw new Error(`Файл ${sysFileId} не удалось зарегистрировать в списке синхронизации пакетов.`); }
}
