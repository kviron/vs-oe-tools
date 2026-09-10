import type { PoolClient } from 'pg';
import type { AttributeEditorOptions, ClassAttributeDraft, CreatedClassAttribute } from '../../features/classes/models';
import {
	attributeClassId,
	attributeDistributionClassId,
	attributeVisibilityClassId,
	defaultAttributeDistributionModeId,
	defaultAttributeVisibilityId,
	encodeAttributeAuditValues,
	normalizeClassAttributeDraft,
	parseValueClassIds,
	validateClassAttributeDraft,
	valueClassesReferenceAttributeId,
} from '../../features/classes/attributeCreation';
import { getSessionContext } from '../configuration/sessionContext';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

interface OwnerRow { id: number; name: string; sysfile: number | null; }
interface DeveloperRangeRow { id: number; beginid: number; endid: number; }
interface IdRow { id: number; }

export async function getAttributeEditorOptions(ownerClassId: number): Promise<AttributeEditorOptions> {
	return withProjectDatabaseSession(async ({ client, options }) => {
		const owner = await loadOwner(client, options.database, ownerClassId);
		const [types, visibilities, distributionModes] = await Promise.all([
			executeMonitoredQuery<{ id: number; name: string }>(client, { text: 'SELECT id, name FROM attrtypes ORDER BY id', source: 'Типы нового атрибута', database: options.database }),
			executeMonitoredQuery<{ id: number; name: string }>(client, { text: 'SELECT id, COALESCE(fullname, name) AS name FROM enum WHERE classid = $1 ORDER BY id', values: [attributeVisibilityClassId], source: 'Видимость нового атрибута', database: options.database }),
			executeMonitoredQuery<{ id: number; name: string }>(client, { text: 'SELECT id, COALESCE(fullname, name) AS name FROM enum WHERE classid = $1 ORDER BY id', values: [attributeDistributionClassId], source: 'Дистрибуция нового атрибута', database: options.database }),
		]);
		return {
			ownerClassId: owner.id,
			ownerClassName: owner.name,
			types: types.rows,
			visibilities: visibilities.rows,
			distributionModes: distributionModes.rows,
			defaults: { visibilityId: defaultAttributeVisibilityId, distributionModeId: defaultAttributeDistributionModeId, isNotNull: false, virtual: true, refIntegrityCheck: false },
		};
	});
}

export async function createClassAttribute(input: ClassAttributeDraft): Promise<CreatedClassAttribute> {
	validateClassAttributeDraft(input);
	const draft = normalizeClassAttributeDraft(input);
	return withProjectDatabaseSession(async ({ client, options }) => {
	try {
		await client.query('BEGIN');
		const session = await getSessionContext(client, options.database);
		const owner = await loadOwner(client, options.database, draft.ownerClassId, true);
		const developerRangeResult = await executeMonitoredQuery<DeveloperRangeRow>(client, {
			text: `SELECT developer_range.id, developer_range.beginid, developer_range.endid
			 FROM users AS session_user_row
			 JOIN users AS developer_user ON developer_user.person = session_user_row.person
			 JOIN developerids AS developer_range ON developer_range.userid = developer_user.id
			 WHERE session_user_row.id = $1
			 ORDER BY CASE WHEN developer_user.id = session_user_row.id THEN 0 ELSE 1 END, developer_range.beginid DESC
			 LIMIT 1`,
			values: [session.userId], source: 'Диапазон ID нового атрибута', database: options.database,
		});
		const range = developerRangeResult.rows[0];
		if (!range) { throw new Error(`Для пользователя ${session.userId} не найден диапазон DeveloperIDs.`); }
		await executeMonitoredQuery(client, {
			text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [attributeClassId, range.id],
			source: 'Блокировка генерации ID атрибута', database: options.database,
		});
		const duplicate = await executeMonitoredQuery<{ id: number }>(client, {
			text: `SELECT id FROM attributes WHERE seniorid = $1
			 AND (upper(name) = upper($2) OR ($3 <> '' AND upper(COALESCE(dbfieldname, '')) = upper($3))) LIMIT 1`,
			values: [draft.ownerClassId, draft.name, draft.dbFieldName], source: 'Проверка имени нового атрибута', database: options.database,
		});
		if (duplicate.rowCount) { throw new Error(`В классе ${owner.name} уже есть атрибут с таким именем или полем таблицы.`); }
		const typeResult = await executeMonitoredQuery<IdRow>(client, {
			text: 'SELECT id FROM attrtypes WHERE id = $1', values: [draft.attributeTypeId], source: 'Проверка типа атрибута', database: options.database,
		});
		if (!typeResult.rowCount) { throw new Error(`Тип атрибута ${draft.attributeTypeId} не найден.`); }
		const enumResult = await executeMonitoredQuery<{ id: number; classid: number }>(client, {
			text: 'SELECT id,classid FROM enum WHERE (id=$1 AND classid=$2) OR (id=$3 AND classid=$4)',
			values: [draft.visibilityId, attributeVisibilityClassId, draft.distributionModeId, attributeDistributionClassId],
			source: 'Проверка видимости и дистрибуции атрибута', database: options.database,
		});
		if (enumResult.rowCount !== 2) { throw new Error('Выбрана неизвестная область видимости или дистрибуция.'); }
		const valueClassIds = parseValueClassIds(draft.valueClasses);
		if (valueClassIds.length) {
			const references = await executeMonitoredQuery<IdRow>(client, {
				text: 'SELECT id FROM abstract WHERE id = ANY($1::integer[])', values: [valueClassIds], source: 'Проверка классов значений атрибута', database: options.database,
			});
			if (references.rowCount !== valueClassIds.length) { throw new Error('Один или несколько классов значений не найдены.'); }
		}
		const idResult = await executeMonitoredQuery<IdRow>(client, {
			text: `SELECT candidate AS id FROM generate_series($1::integer, $2::integer) AS candidate
			 WHERE NOT EXISTS (SELECT 1 FROM abstract WHERE id = candidate) ORDER BY candidate LIMIT 1`,
			values: [range.beginid, range.endid], source: 'Генерация ID нового атрибута', database: options.database,
		});
		const id = Number(idResult.rows[0]?.id);
		if (!Number.isSafeInteger(id) || id <= 0) { throw new Error(`В диапазоне DeveloperIDs ${range.beginid}…${range.endid} нет свободного ID.`); }

		await executeMonitoredQuery(client, {
			text: `INSERT INTO attributes
			 (lastchange,id,classid,seniorid,name,aliases,visibility,dbfieldname,attrtype,isnotnull,valueclasses,attrvaluedistrmode,virtual,refintegritycheck)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
			values: [session.changeDate, id, attributeClassId, draft.ownerClassId, draft.name, draft.aliases || null,
				draft.visibilityId, draft.dbFieldName || null, draft.attributeTypeId, draft.isNotNull ? -1 : 0, draft.valueClasses || null,
				draft.distributionModeId, -1, draft.refIntegrityCheck ? 1 : 0],
			source: `Создание атрибута ${draft.name}`, database: options.database,
		});
		await executeMonitoredQuery(client, {
			text: 'INSERT INTO abstract (lastchange,id,classid,seniorid,name,sysfile) VALUES ($1,$2,$3,$4,$5,$6)',
			values: [session.changeDate, id, attributeClassId, draft.ownerClassId, draft.name, owner.sysfile],
			source: `Создание Abstract атрибута ${id}`, database: options.database,
		});
		for (const valueClassId of valueClassIds) {
			await executeMonitoredQuery(client, {
				text: 'INSERT INTO objrefs(obj,ref,attr) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
				values: [id, valueClassId, valueClassesReferenceAttributeId], source: `Ссылка класса значений атрибута ${id}`, database: options.database,
			});
		}
		await executeMonitoredQuery(client, {
			text: `INSERT INTO logcchangedobject
			 (objid,objclassid,changetype,newvalues,userid,computername,changedate,oldvalues,transactioncomment,versionobject,rootobjid,rootobjclassid)
			 VALUES ($1,$2,3,$3,$4,$5,$6,$7,$8,'1899-12-30 00:00:00',$9,3)`,
			values: [id, attributeClassId, encodeAttributeAuditValues(draft), session.userId, session.computerName,
				session.changeDate, Buffer.alloc(0), 'Сохранение объекта класса "Атрибут', draft.ownerClassId],
			source: `Логирование создания атрибута ${id}`, database: options.database,
		});
		const version = await executeMonitoredQuery(client, {
			text: `UPDATE classes SET classversion = CASE WHEN classversion = 2147483647 THEN -2147483648
			 ELSE COALESCE(classversion,0) + 1 END WHERE id = $1`,
			values: [draft.ownerClassId], source: `Обновление версии класса ${draft.ownerClassId}`, database: options.database,
		});
		if (version.rowCount !== 1) { throw new Error(`Класс ${draft.ownerClassId} исчез во время сохранения.`); }
		if (owner.sysfile !== null) {
			await executeMonitoredQuery(client, {
				text: 'UPDATE syspackagebase SET objectchangestate = 1 WHERE objectid = $1', values: [owner.sysfile],
				source: `Отметка пакетного файла ${owner.sysfile} изменённым`, database: options.database,
			});
		}
		await client.query('COMMIT');
		return { id, ownerClassId: draft.ownerClassId, name: draft.name };
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	}
	});
}

async function loadOwner(client: PoolClient, database: string, ownerClassId: number, forUpdate = false): Promise<OwnerRow> {
	const result = await executeMonitoredQuery<OwnerRow>(client, {
		text: `SELECT class.id,class.name,abstract.sysfile FROM classes AS class
		 JOIN abstract ON abstract.id=class.id WHERE class.id=$1${forUpdate ? ' FOR UPDATE OF class' : ''}`,
		values: [ownerClassId], source: `Класс-владелец атрибута ${ownerClassId}`, database,
	});
	const owner = result.rows[0];
	if (!owner) { throw new Error(`Класс ${ownerClassId} не найден.`); }
	return owner;
}
