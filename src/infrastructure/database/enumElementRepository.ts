import type { PoolClient } from 'pg';
import { encodeEnumElementAudit, validateEnumElementDraft, type EnumElementCreationRequest } from '../../features/classes/enumElementCreation';
import { getSessionContext, type SessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';
import { registerPackageFileChange } from './objectPackageBindingRepository';

export async function createEnumElement(request: EnumElementCreationRequest) {
	validateEnumElementDraft(request);
	return withProjectDatabaseSession(async ({ client, options }) => {
		if (options.database.toLowerCase() !== request.expectedDatabase.toLowerCase()
			|| options.host.toLowerCase() !== request.expectedHost.toLowerCase() || options.port !== request.expectedPort) {
			throw new Error('Активное подключение изменилось. Повторите get_active_database.');
		}
		return createEnumElementWithClient(client, request, () => getSessionContext(client, options.database));
	});
}

export async function createEnumElementWithClient(client: PoolClient, request: EnumElementCreationRequest,
	loadSession: () => Promise<SessionContext>) {
	validateEnumElementDraft(request);
	const query = <T extends import('pg').QueryResultRow = Record<string, unknown>>(text: string, values: unknown[] = []) =>
		executeMonitoredQuery<T>(client, { text, values, database: request.expectedDatabase, source: 'Создание элемента перечисления' });
	let committed = false;
	let id: number | undefined;
	await client.query('BEGIN');
	try {
		await client.query("SET LOCAL lock_timeout = '2s'");
		await client.query("SET LOCAL statement_timeout = '15s'");
		const identity = await query<{ database: string }>('SELECT current_database() AS database');
		if (identity.rows[0]?.database.toLowerCase() !== request.expectedDatabase.toLowerCase()) {
			throw new Error('Подключена другая база; создание отменено.');
		}
		// Also serializes against native INSERTs, whose ID allocator has no advisory lock.
		await client.query('LOCK TABLE abstract IN SHARE ROW EXCLUSIVE MODE');
		const owner = (await query<{ sysfile: number; filename: string; packagename: string }>(`
		 SELECT a.sysfile, f.filename, p.packagename FROM classes c
		 JOIN abstract a ON a.id=c.id JOIN sysfile f ON f.id=a.sysfile
		 JOIN sysgroups g ON g.id=f.sysgroup JOIN syspackages p ON p.id=g.package
		 WHERE c.id=$1 AND c.seniorid=23101 AND lower(c.dbtablename)='enum'
		 AND COALESCE(c.isabstract,0)=0 AND COALESCE(c.virtual,0)=0
		 FOR UPDATE OF c, a, f`, [request.classId])).rows[0];
		if (!owner || !owner.packagename || !owner.filename || /^#package\$(\.pkf)?$/i.test(owner.filename)) {
			throw new Error('Нужен конкретный пакетный файл прямого подкласса Перечисление с таблицей Enum.');
		}
		const duplicate = await query('SELECT id FROM enum WHERE classid=$1 AND upper(name)=upper($2)', [request.classId, request.name]);
		if (duplicate.rowCount) { throw new Error(`Элемент ${request.name} уже существует: ID=${duplicate.rows[0].id}.`); }
		const session = await loadSession();
		const range = (await query<{ beginid: string; endid: string }>(`
		 SELECT r.beginid, r.endid FROM users u JOIN developerids r ON
		 r.userid=u.id OR (r.userid IS NULL AND EXISTS (SELECT 1 FROM developer d
		 WHERE d.id=r.developerid AND d.name<>'' AND regexp_replace(u.name,'^(ВЭ_|вэ_)','') ILIKE d.name || '%'))
		 WHERE u.id=$1 AND r.beginid>0 AND r.endid<13000000
		 AND (r.holes IS NULL OR blobsize(r.holes)=0)
		 ORDER BY CASE WHEN r.userid=u.id THEN 0 ELSE 1 END, r.beginid DESC LIMIT 1`, [session.userId])).rows[0];
		if (!range) { throw new Error('Не найден непрерывный диапазон ID разработчика ниже 13000000.'); }
		// Same MAX(Abstract.ID)+1 rule used by OE_SYSTEM_GENGUID_ENUM_RANGES_V3.
		id = Number((await query<{ id: string }>(`SELECT COALESCE(MAX(id)+1,$1::bigint) AS id
		 FROM abstract WHERE id BETWEEN $1::bigint AND $2::bigint`, [range.beginid, range.endid])).rows[0]?.id);
		if (!Number.isSafeInteger(id) || id < Number(range.beginid) || id > Number(range.endid)) {
			throw new Error('Диапазон ID разработчика исчерпан.');
		}
		await query(`INSERT INTO logcchangedobject
		 (objid,objclassid,changetype,newvalues,userid,computername,changedate,oldvalues,
		 transactioncomment,versionobject,rootobjid,rootobjclassid)
		 VALUES ($1,$2,3,$3,$4,$5,$6,$7,'','1899-12-30 00:00:00',$1,$2)`,
		[id, request.classId, encodeEnumElementAudit(request, Number(owner.sysfile)), session.userId,
		 session.computerName, session.changeDate, Buffer.alloc(0)]);
		await query(`INSERT INTO enum (id,classid,name,fullname,ord,lastchange)
		 VALUES ($1,$2,$3,$4,$5,$6)`, [id,request.classId,request.name,request.fullName,request.ord,session.changeDate]);
		await query(`INSERT INTO abstract (id,classid,name,ord,lastchange,sysfile)
		 VALUES ($1,$2,$3,$4,$5,$6)`, [id,request.classId,request.name,request.ord,session.changeDate,owner.sysfile]);
		await registerPackageFileChange(client, request.expectedDatabase, Number(owner.sysfile), session);
		await client.query('COMMIT');
		committed = true;
		const saved = (await query<{ id: string; classid: string; name: string; fullname: string; ord: number; sysfile: string; synced: boolean }>(`
		 SELECT e.id,e.classid,e.name,e.fullname,e.ord,a.sysfile,
		 EXISTS(SELECT 1 FROM syspackagebase b WHERE b.objectid=a.sysfile AND b.objectchangestate=2) AS synced
		 FROM enum e JOIN abstract a ON a.id=e.id WHERE e.id=$1`, [id])).rows[0];
		if (!saved || Number(saved.classid)!==request.classId || saved.name!==request.name
			|| saved.fullname!==request.fullName || Number(saved.ord)!==request.ord
			|| Number(saved.sysfile)!==Number(owner.sysfile) || !saved.synced) {
			throw new Error('Контрольное чтение не подтвердило поля и пакетную привязку.');
		}
		return { objectId:id, classId:request.classId, name:request.name, fullName:request.fullName, ord:request.ord,
			database:request.expectedDatabase, sysFileId:Number(owner.sysfile), packageName:owner.packagename,
			verified:true, requiresClientRestart:true };
	} catch (error) {
		if (!committed) { await client.query('ROLLBACK').catch(() => undefined); }
		throw new Error(`${committed ? `Элемент ID=${id} уже создан; не повторяйте создание. ` : 'Создание отменено. '}${error instanceof Error ? error.message : String(error)}`);
	}
}
