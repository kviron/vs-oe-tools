import type { PoolClient } from 'pg';
import type { PackageBindingMutationRequest } from '../../features/package-sync/packageBindingMutation';
import { validatePackageBindingMutationRequest } from '../../features/package-sync/packageBindingMutation';
import { getSessionContext, type SessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

interface BindingTargetRow {
	objectid: number | null;
	sysfileid: number;
	filename: string;
	sysgroupid: number;
	groupname: string;
	packageid: number;
	packagename: string;
}

interface BindingObjectRow {
	id: number;
	classid: number;
	seniorid: number | null;
	name: string;
	sysfile: number | null;
}

export interface PackageBindingMutationResult {
	database: string;
	host: string;
	port: number;
	target: BindingTargetRow;
	changedObjectIds: number[];
	unchangedObjectIds: number[];
	objects: Array<BindingObjectRow & { packageName: string }>;
}

export async function bindObjectsToPackage(request: PackageBindingMutationRequest): Promise<PackageBindingMutationResult> {
	validatePackageBindingMutationRequest(request);
	return withProjectDatabaseSession(async ({ client, options }) => {
		if (options.database.toLocaleLowerCase('en-US') !== request.expectedDatabase.toLocaleLowerCase('en-US')) {
			throw new Error(`Активная база изменилась: MCP ожидал ${request.expectedDatabase}, расширение выбрало ${options.database}. Повторите get_active_database.`);
		}
		if (options.host.toLocaleLowerCase('en-US') !== request.expectedHost.toLocaleLowerCase('en-US')
			|| options.port !== request.expectedPort) {
			throw new Error(`Активное подключение изменилось: MCP ожидал ${request.expectedHost}:${request.expectedPort}, расширение выбрало ${options.host}:${options.port}. Повторите get_active_database.`);
		}
		return bindObjectsToPackageWithClient(client, options.database, request, () => getSessionContext(client, options.database));
	});
}

export async function bindObjectsToPackageWithClient(
	client: PoolClient,
	database: string,
	request: PackageBindingMutationRequest,
	loadSession: () => Promise<SessionContext>,
): Promise<PackageBindingMutationResult> {
	validatePackageBindingMutationRequest(request);
	let committed = false;
	await client.query('BEGIN');
	try {
		await client.query("SET LOCAL statement_timeout = '15s'");
		await client.query("SET LOCAL lock_timeout = '2s'");
		const databaseResult = await executeMonitoredQuery<{ database: string }>(client, {
			text: 'SELECT current_database() AS database', values: [],
			source: 'Проверка базы перед пакетной привязкой', database,
		});
		const actualDatabase = databaseResult.rows[0]?.database;
		if (!actualDatabase || actualDatabase.toLocaleLowerCase('en-US') !== request.expectedDatabase.toLocaleLowerCase('en-US')) {
			throw new Error(`Подключена база ${actualDatabase ?? '<не определена>'}, ожидалась ${request.expectedDatabase}. Изменения отменены.`);
		}

		const target = await loadBindingTarget(client, database, request);
		validateBindingTarget(target);
		const objectResult = await executeMonitoredQuery<BindingObjectRow, [number[]]>(client, {
			text: `SELECT id, classid, seniorid, name, sysfile
			 FROM abstract WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
			values: [request.objectIds], source: 'Блокировка объектов для пакетной привязки', database,
		});
		const foundIds = new Set(objectResult.rows.map(row => Number(row.id)));
		const missingIds = request.objectIds.filter(id => !foundIds.has(id));
		if (missingIds.length > 0) {
			throw new Error(`Объекты не найдены: ${missingIds.join(', ')}. Изменения отменены.`);
		}
		const conflicting = objectResult.rows.filter(row => row.sysfile !== null && Number(row.sysfile) !== target.sysfileid);
		if (conflicting.length > 0) {
			throw new Error(`Объекты уже привязаны к другим пакетным файлам: ${conflicting.map(row => `${row.id} -> ${row.sysfile}`).join(', ')}. Автоматическое перемещение запрещено.`);
		}

		const changedObjectIds = objectResult.rows.filter(row => row.sysfile === null).map(row => Number(row.id));
		const unchangedObjectIds = objectResult.rows.filter(row => Number(row.sysfile) === target.sysfileid).map(row => Number(row.id));
		const session = await loadSession();
		if (changedObjectIds.length > 0) {
			const updateResult = await executeMonitoredQuery<{ id: number }, [number, number[]]>(client, {
				text: 'UPDATE abstract SET sysfile = $1 WHERE id = ANY($2::bigint[]) AND sysfile IS NULL RETURNING id',
				values: [target.sysfileid, changedObjectIds], source: `Привязка объектов к пакетному файлу ${target.sysfileid}`, database,
			});
			if (updateResult.rowCount !== changedObjectIds.length) {
				throw new Error('Не все объекты были привязаны. Конкурирующее изменение обнаружено; транзакция отменена.');
			}
		}
		await registerPackageFileChange(client, database, target.sysfileid, session);
		await client.query('COMMIT');
		committed = true;

		const verification = await executeMonitoredQuery<BindingObjectRow, [number[]]>(client, {
			text: 'SELECT id, classid, seniorid, name, sysfile FROM abstract WHERE id = ANY($1::bigint[]) ORDER BY id',
			values: [request.objectIds], source: 'Проверка пакетной привязки после commit', database,
		});
		if (verification.rows.length !== request.objectIds.length
			|| verification.rows.some(row => Number(row.sysfile) !== target.sysfileid)) {
			throw new Error('Проверка после commit не подтвердила пакетную привязку всех объектов.');
		}
		return {
			database: actualDatabase,
			host: request.expectedHost,
			port: request.expectedPort,
			target,
			changedObjectIds,
			unchangedObjectIds,
			objects: verification.rows.map(row => ({
				...row, id: Number(row.id), classid: Number(row.classid),
				seniorid: row.seniorid === null ? null : Number(row.seniorid),
				sysfile: row.sysfile === null ? null : Number(row.sysfile), packageName: target.packagename,
			})),
		};
	} catch (error) {
		if (!committed) {
			await client.query('ROLLBACK').catch(() => undefined);
		} else {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Пакетная привязка была commit, но контрольное чтение завершилось ошибкой: ${message}`);
		}
		throw error;
	}
}

async function loadBindingTarget(client: PoolClient, database: string, request: PackageBindingMutationRequest): Promise<BindingTargetRow> {
	const byTemplate = request.templateObjectId !== undefined;
	const result = await executeMonitoredQuery<BindingTargetRow, [number]>(client, {
		text: `SELECT ${byTemplate ? 'object.id' : 'NULL::bigint'} AS objectid,
		        file.id AS sysfileid, file.filename, file.sysgroup AS sysgroupid,
		        file_group.groupname, package.id AS packageid, package.packagename
		 FROM ${byTemplate ? 'abstract AS object JOIN sysfile AS file ON file.id = object.sysfile' : 'sysfile AS file'}
		 JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		 JOIN syspackages AS package ON package.id = file_group.package
		 WHERE ${byTemplate ? 'object.id' : 'file.id'} = $1
		 FOR UPDATE OF file`,
		values: [request.templateObjectId ?? request.sysFileId!],
		source: 'Получение цели пакетной привязки', database,
	});
	if (result.rowCount !== 1) {
		throw new Error(byTemplate
			? `Шаблонный объект ${request.templateObjectId} не найден или не привязан к конкретному пакету.`
			: `Пакетный файл ${request.sysFileId} не найден или не принадлежит конкретному пакету.`);
	}
	const row = result.rows[0];
	return {
		...row,
		objectid: row.objectid === null ? null : Number(row.objectid),
		sysfileid: Number(row.sysfileid),
		sysgroupid: Number(row.sysgroupid),
		packageid: Number(row.packageid),
	};
}

function validateBindingTarget(target: BindingTargetRow): void {
	const fileName = target.filename.trim().toLocaleLowerCase('en-US');
	if (!target.packageid || !target.packagename.trim()) {
		throw new Error(`SysFile ${target.sysfileid} не принадлежит конкретному пакету.`);
	}
	if (!fileName || fileName === '#package$' || fileName === '#package$.pkf') {
		throw new Error(`SysFile ${target.sysfileid} является служебным #package$ и не может быть целью автоматической привязки.`);
	}
}

async function registerPackageFileChange(client: PoolClient, database: string, sysFileId: number, session: SessionContext): Promise<void> {
	const result = await executeMonitoredQuery(client, {
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
		 SET objectchangestate = 2,
		     objectchangelastdate = EXCLUDED.objectchangelastdate,
		     objectchangelastuser = EXCLUDED.objectchangelastuser`,
		values: [session.changeDate, String(session.userId), session.userId, sysFileId],
		source: `Регистрация изменения пакетного файла ${sysFileId}`, database,
	});
	if (result.rowCount !== 1) {
		throw new Error(`Файл ${sysFileId} не удалось зарегистрировать в списке синхронизации пакетов.`);
	}
}
