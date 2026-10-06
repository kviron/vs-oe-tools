import type { PoolClient, QueryResultRow } from 'pg';
import { encodeEnumElementAudit } from '../../features/classes/enumElementCreation';
import { validateEnumElementUpdate, type EnumElementUpdateRequest } from '../../features/classes/enumElementUpdate';
import { getSessionContext, type SessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { registerPackageFileChange } from './objectPackageBindingRepository';
import { withProjectDatabaseSession } from './projectDatabaseSession';

interface ElementRow extends QueryResultRow {
	classid: number; name: string; fullname: string; ord: number;
	sysfile: number | null; packagename: string | null;
	abstractname: string; abstractord: number; abstractclassid: number;
}

export async function updateEnumElement(request: EnumElementUpdateRequest) {
	validateEnumElementUpdate(request);
	return withProjectDatabaseSession(async ({ client, options }) => {
		if (options.database.toLowerCase() !== request.expectedDatabase.toLowerCase()
			|| options.host.toLowerCase() !== request.expectedHost.toLowerCase() || options.port !== request.expectedPort) {
			throw new Error('Активное подключение изменилось. Повторите get_active_database.');
		}
		return updateEnumElementWithClient(client, request, () => getSessionContext(client, options.database));
	});
}

export async function updateEnumElementWithClient(client: PoolClient, request: EnumElementUpdateRequest,
	loadSession: () => Promise<SessionContext>) {
	validateEnumElementUpdate(request);
	const query = <T extends QueryResultRow = Record<string, unknown>>(text: string, values: unknown[] = []) =>
		executeMonitoredQuery<T>(client, { text, values, database:request.expectedDatabase, source:'Редактирование элемента перечисления' });
	const readSql = `SELECT e.classid,e.name,e.fullname,e.ord,a.sysfile,
	 p.packagename,a.name AS abstractname,a.ord AS abstractord,a.classid AS abstractclassid
	 FROM enum e JOIN abstract a ON a.id=e.id JOIN classes c ON c.id=e.classid
	 LEFT JOIN sysfile f ON f.id=a.sysfile
	 LEFT JOIN sysgroups g ON g.id=f.sysgroup LEFT JOIN syspackages p ON p.id=g.package
	 WHERE e.id=$1 AND c.seniorid=23101 AND lower(c.dbtablename)='enum'
	 AND COALESCE(c.isabstract,0)=0 AND COALESCE(c.virtual,0)=0`;
	const checkElement = (row: ElementRow | undefined) => {
		if (!row || Number(row.classid)!==request.classId || Number(row.abstractclassid)!==request.classId) {
			throw new Error('Элемент не найден в указанном прямом подклассе Перечисление.');
		}
	};
	let committed = false;
	await client.query('BEGIN');
	try {
		await client.query("SET LOCAL lock_timeout = '2s'");
		await client.query("SET LOCAL statement_timeout = '15s'");
		const identity = await query<{ database: string }>('SELECT current_database() AS database');
		if (identity.rows[0]?.database.toLowerCase()!==request.expectedDatabase.toLowerCase()) {
			throw new Error('Подключена другая база.');
		}
		const old = (await query<ElementRow>(readSql+' FOR UPDATE OF e,a,c', [request.objectId])).rows[0];
		checkElement(old);
		if (old.name!==request.previous.name || old.fullname!==request.previous.fullName || Number(old.ord)!==request.previous.ord) {
			throw new Error('Элемент изменён после чтения. Перечитайте поля перед редактированием.');
		}
		if (old.abstractname!==old.name || Number(old.abstractord)!==Number(old.ord)) {
			throw new Error('Поля Enum и Abstract расходятся; требуется проверка объекта.');
		}
		const changed = old.name!==request.name || old.fullname!==request.fullName || Number(old.ord)!==request.ord;
		if (changed) {
			const duplicate = await query('SELECT id FROM enum WHERE classid=$1 AND upper(name)=upper($2) AND id<>$3',
				[request.classId,request.name,request.objectId]);
			if (duplicate.rowCount) { throw new Error(`Имя уже занято элементом ID=${duplicate.rows[0].id}.`); }
			const session = await loadSession();
			const audit = await query(`INSERT INTO logcchangedobject
			 (objid,objclassid,changetype,newvalues,userid,computername,changedate,oldvalues,
			 transactioncomment,versionobject,rootobjid,rootobjclassid)
			 VALUES ($1,$2,2,$3,$4,$5,$6,$7,'','1899-12-30 00:00:00',$1,$2)`,
			[request.objectId,request.classId,encodeEnumElementAudit(request,Number(old.sysfile)),session.userId,
			 session.computerName,session.changeDate,
			 encodeEnumElementAudit({ classId:request.classId, ...request.previous },Number(old.sysfile))]);
			if (audit.rowCount!==1) { throw new Error('Не удалось записать аудит изменения.'); }
			const element = await query(`UPDATE enum SET name=$1,fullname=$2,ord=$3,lastchange=$4 WHERE id=$5 AND classid=$6`,
				[request.name,request.fullName,request.ord,session.changeDate,request.objectId,request.classId]);
			const abstract = await query(`UPDATE abstract SET name=$1,ord=$2,lastchange=$3 WHERE id=$4 AND classid=$5`,
				[request.name,request.ord,session.changeDate,request.objectId,request.classId]);
			if (element.rowCount!==1 || abstract.rowCount!==1) { throw new Error('Не все поля элемента сохранены.'); }
			if (old.sysfile !== null) {
				await registerPackageFileChange(client,request.expectedDatabase,Number(old.sysfile),session);
			}
		}
		await client.query('COMMIT');
		committed = true;
		const saved = (await query<ElementRow>(readSql,[request.objectId])).rows[0];
		checkElement(saved);
		if (saved.name!==request.name || saved.fullname!==request.fullName || Number(saved.ord)!==request.ord
			|| saved.abstractname!==request.name || Number(saved.abstractord)!==request.ord) {
			throw new Error('Контрольное чтение не подтвердило поля элемента.');
		}
		return { objectId:request.objectId, classId:request.classId, name:saved.name, fullName:saved.fullname, ord:Number(saved.ord),
			database:request.expectedDatabase, sysFileId:saved.sysfile === null ? null : Number(saved.sysfile), packageName:saved.packagename,
			changed, verified:true, requiresClientRestart:changed };
	} catch (error) {
		if (!committed) { await client.query('ROLLBACK').catch(() => undefined); }
		throw new Error(`${committed ? `Транзакция элемента ID=${request.objectId} завершена; перечитайте объект перед повтором. ` : 'Изменение отменено. '}${error instanceof Error ? error.message : String(error)}`);
	}
}
