import { hostname } from 'node:os';
import * as iconv from 'iconv-lite';
import { getAutomaticIdRangeStart } from '../../features/spu/spuCreation';
import { validateLocalToolClassName } from '../../features/classes/localToolClassName';
import { getSessionContext } from '../configuration/sessionContext';
import { withProjectDatabaseSession } from './projectDatabaseSession';

const parentClassId = 10055136; // BaseUtils: virtual utility classes without a database table.
const classObjectId = 3;
const minimumLocalId = 13_000_000;

export interface LocalToolClass { id: number; name: string; parentClassId: number; database: string; sysFile: null; requiresClientRestart: true }

export async function createLocalToolClass(name: string, expectedDatabase: string,
	expectedHost: string, expectedPort: number): Promise<LocalToolClass> {
	const className = validateLocalToolClassName(name);
	return withProjectDatabaseSession(async ({ client, options }) => {
		if (options.database.toLowerCase() !== expectedDatabase.toLowerCase()
			|| options.host.toLowerCase() !== expectedHost.toLowerCase() || options.port !== expectedPort) {
			throw new Error(`Выбранное подключение ${options.host}:${options.port}/${options.database} изменилось.`);
		}
		const identity = await client.query<{ database: string }>('SELECT current_database() AS database');
		if (identity.rows[0]?.database.toLowerCase() !== expectedDatabase.toLowerCase()) {
			throw new Error(`Подключение не соответствует базе ${expectedDatabase}.`);
		}
		let id: number | undefined;
		const session = await getSessionContext(client, options.database);
		try {
			await client.query('BEGIN');
			const tune = await client.query<{ id: number }>(
				`SELECT id FROM packagestune WHERE upper(computername) = upper($1)
				 OR upper(computername) LIKE upper($1) || '.%'
				 ORDER BY CASE WHEN upper(computername) = upper($1) THEN 0 ELSE 1 END LIMIT 1`, [hostname()]);
			const rangeStart = getAutomaticIdRangeStart(Number(tune.rows[0]?.id));
			await client.query('SELECT pg_advisory_xact_lock($1, $2)', [classObjectId, rangeStart]);
			const parent = await client.query<{ id: number }>(
				'SELECT id FROM classes WHERE id = $1 AND virtual = -1 AND NULLIF(dbtablename, \'\') IS NULL', [parentClassId]);
			if (parent.rowCount !== 1) { throw new Error('Предок BaseUtils не подходит для локального utility-класса.'); }
			const duplicate = await client.query('SELECT id FROM classes WHERE lower(name) = lower($1) LIMIT 1', [className]);
			if (duplicate.rowCount) { throw new Error(`Класс «${className}» уже существует.`); }
			const available = await client.query<{ id: number }>(
				`WITH first AS (
				 SELECT afirstfreeid AS id FROM oe_system_genguid_enum_ranges_v3(2147483647, $1::bigint, 1000000)
				 WHERE astartid = $1::bigint AND afirstfreeid < aendid LIMIT 1
				)
				 SELECT candidate AS id FROM first,
				 generate_series(greatest(first.id, $2::bigint), $1::bigint + 999999) candidate
				 WHERE candidate >= $2::bigint
				   AND NOT EXISTS (SELECT 1 FROM abstract WHERE id = candidate)
				 ORDER BY candidate LIMIT 1`, [rangeStart, minimumLocalId]);
			id = Number(available.rows[0]?.id);
			if (!Number.isSafeInteger(id) || id < minimumLocalId) { throw new Error('Не найден свободный непакетный ID класса.'); }
			const auditValues = iconv.encode(`102,${parentClassId},103,${className}`, 'win1251');
			await client.query(
				`INSERT INTO logcchangedobject
				 (objid,objclassid,changetype,newvalues,userid,computername,changedate,oldvalues,
				  transactioncomment,versionobject,rootobjid,rootobjclassid)
				 VALUES ($1,3,3,$2,$3,$4,$5,$6,'','1899-12-30 00:00:00',$7,3)`,
				[id, auditValues, session.userId, session.computerName, session.changeDate, iconv.encode('', 'win1251'), parentClassId]);
			await client.query(
				`INSERT INTO classes (id,classid,seniorid,name,isabstract,isinheritable,cacheobjclass,
				 virtual,refintegritycheck,classversion,lastchange)
				 VALUES ($1,3,$2,$3,0,0,65013,-1,1,$4,$5)`,
				[id, parentClassId, className, Math.floor(Date.now() / 1000), session.changeDate]);
			await client.query(
				`INSERT INTO abstract (id,classid,seniorid,name,lastchange,sysfile)
				 VALUES ($1,3,$2,$3,$4,NULL)`, [id, parentClassId, className, session.changeDate]);
			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw error;
		}
		const verified = await client.query<{ id: number; name: string; parentclassid: number; sysfile: number | null; syncid: number | null }>(
			`SELECT c.id,c.name,c.seniorid AS parentclassid,a.sysfile,s.objectid AS syncid
			 FROM classes c JOIN abstract a ON a.id=c.id
			 LEFT JOIN syspackagebase s ON s.objectid=a.sysfile WHERE c.id=$1`, [id]);
		const row = verified.rows[0];
		if (!row || row.name !== className || Number(row.parentclassid) !== parentClassId || row.sysfile !== null || row.syncid !== null) {
			throw new Error(`Класс ID=${id} создан, но контрольное чтение не подтвердило непакетное состояние. Не создавайте повторно до проверки.`);
		}
		return { id: id!, name: className, parentClassId, database: options.database, sysFile: null, requiresClientRestart: true };
	});
}
