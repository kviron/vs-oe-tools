import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import type { PoolClient } from 'pg';
import type { PackageSyncItem } from '../../features/package-sync/models';
import {
	appendPkfObjects,
	createEmptyPkf,
	extractPkfObjectIds,
	type PkfDatabaseObject,
} from '../../features/package-sync/pkfDatabaseReconstruction';
import { appendPkfMetaMembers, metaPkfOwnerQuery, requireSingleMetaOwner, serializePkfMetaFile, type MetaVisibility, type PkfMetaMember } from '../../features/package-sync/pkfMetaReconstruction';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

const BLOB_ATTRIBUTE_TYPE = 320;
const BOOLEAN_ATTRIBUTE_TYPE = 310;
const META_CLASS_IDS = new Set([3, 4, 5, 10200019]);

interface AbstractRow { id: number; classid: number; name: string | null; }
interface SysFileRow { contentmd5: string | null; isautogroup: number | null; autogroup: string | null; }
interface MetaClassRow { id: number; name: string; aliases: string | null; parentname: string | null; virtual: number | null; cacheobjclass: number | null; refintegritycheck: number | null; }
interface MetaAttributeRow { id: number; name: string; aliases: string | null; visibility: number | null; attrtype: number; valueclassname: string | null; dbfieldname: string | null; roleread: number | null; rolewrite: number | null; refintegritycheck: number | null; }
interface MetaDefaultRow { id: number; name: string; visibility: number | null; attrtype: number; defvalue: unknown; }
interface MetaMethodRow { id: number; name: string; aliases: string | null; visibility: number | null; methkind: number; signature: unknown; code: unknown; }
interface OwnedMetaMethodRow extends MetaMethodRow { ownerid: number; }
interface MetaOwnerRow { id: number; }
interface ClassStorageRow { name: string; dbtablename: string | null; }
interface StoredAttributeRow { id: number; name: string; dbfieldname: string | null; attrtype: number; depth: number; }

export interface PackageDatabaseVersion {
	content: string;
	addedObjectIds: number[];
	localContent?: string;
}

export async function loadPackageDatabaseVersion(item: PackageSyncItem, fileName: string): Promise<PackageDatabaseVersion> {
	if (path.extname(fileName).toLocaleLowerCase('en-US') !== '.pkf') {throw new Error('Реконструкция из БД пока поддерживается только для PKF.');}
	return withProjectDatabaseSession(async ({ client, options }) => {
		const fileResult = await executeMonitoredQuery<SysFileRow>(client, {
			text: 'SELECT ContentMD5 AS contentmd5, IsAutoGroup AS isautogroup, AutoGroup AS autogroup FROM SysFile WHERE ID = $1', values: [item.objectId],
			source: 'Синхронизация пакетов: проверка базовой версии PKF', database: options.database,
		});
		const fileRow = fileResult.rows[0];
		if (!fileRow) {throw new Error(`Файл ID ${item.objectId} не найден в SysFile.`);}
		const databaseMd5 = String(fileRow.contentmd5 ?? item.contentMd5 ?? '').toUpperCase();
		const bytes = await readFile(fileName).catch(error => isFileNotFound(error) ? undefined : Promise.reject(error));
		let source: string;
		let localContent: string | undefined;
		if (bytes) {
			const localMd5 = createHash('md5').update(bytes).digest('hex').toUpperCase();
			if (!databaseMd5) {
				// The package editor keeps the previous working-copy file when the database file is deleted.
				// Show that file on the left and an empty database version on the right.
				return { content: '', addedObjectIds: [] };
			}
			if (databaseMd5 !== localMd5) {throw new Error(`Локальный PKF не совпадает с базовой версией БД (MD5 ${localMd5}, ожидался ${databaseMd5}).`);}
			source = iconv.decode(bytes, 'win1251');
		} else {
			if (databaseMd5) {throw new Error(`Локальный файл не найден, хотя в БД присутствует базовый MD5 ${databaseMd5}.`);}
			source = createEmptyPkf(Number(fileRow.isautogroup) !== 0 ? fileRow.autogroup : undefined);
			localContent = '';
		}
		const localIds = extractPkfObjectIds(source);

		const abstractResult = await executeMonitoredQuery<AbstractRow>(client, {
			text: 'SELECT ID AS id, ClassID AS classid, Name AS name FROM Abstract WHERE SysFile = $1 ORDER BY ID', values: [item.objectId],
			source: 'Синхронизация пакетов: состав PKF из БД', database: options.database,
		});
		const missingRows = abstractResult.rows.filter(row => !localIds.has(Number(row.id)));
		const hasMetaObjects = abstractResult.rows.some(row => META_CLASS_IDS.has(Number(row.classid)));
		if (hasMetaObjects) {
			if (abstractResult.rows.some(row => !META_CLASS_IDS.has(Number(row.classid)))) {
				const missingMetaRows = missingRows.filter(row => META_CLASS_IDS.has(Number(row.classid)));
				const sourceWithCurrentMeta = await appendMissingMetaMembers(client, options.database, source, missingMetaRows);
				const missingDataRows = missingRows.filter(row => !META_CLASS_IDS.has(Number(row.classid)));
				const objects = await buildDatabaseObjects(client, options.database, missingDataRows);
				return { content: appendPkfObjects(sourceWithCurrentMeta, objects), addedObjectIds: missingRows.map(row => Number(row.id)), localContent };
			}
			const content = await loadMetaPkf(client, options.database, item.objectId);
			return { content, addedObjectIds: missingRows.map(row => Number(row.id)), localContent };
		}
		const objects = await buildDatabaseObjects(client, options.database, abstractResult.rows);
		const databaseSource = createEmptyPkf(Number(fileRow.isautogroup) !== 0 ? fileRow.autogroup : undefined);
		return { content: appendPkfObjects(databaseSource, objects), addedObjectIds: missingRows.map(row => Number(row.id)), localContent };
	}, undefined, 'vc-ve-tools-package-diff');
}

async function appendMissingMetaMembers(client: PoolClient, database: string, source: string, rows: readonly AbstractRow[]): Promise<string> {
	if (!rows.length) {return source;}
	const unsupported = rows.filter(row => Number(row.classid) !== 5);
	if (unsupported.length) {
		throw new Error(`Смешанный Meta/Data-PKF содержит новые meta-объекты неподдерживаемых классов (${unsupported.map(row => row.id).join(', ')}).`);
	}
	const ids = rows.map(row => Number(row.id));
	const result = await executeMonitoredQuery<OwnedMetaMethodRow>(client, {
		text: `SELECT M.ID AS id, M.SeniorID AS ownerid, M.Name AS name, M.Aliases AS aliases,
		        M.Visibility AS visibility, M.MethKind AS methkind, M.Signature AS signature, M.Code AS code
		 FROM Methods M WHERE M.ID = ANY($1::integer[]) ORDER BY M.SeniorID, M.ID`,
		values: [ids], source: 'Синхронизация пакетов: новые методы смешанного Meta/Data-PKF', database,
	});
	if (result.rows.length !== rows.length) {
		const found = new Set(result.rows.map(row => Number(row.id)));
		throw new Error(`Не удалось прочитать новые meta-методы: ${ids.filter(id => !found.has(id)).join(', ')}.`);
	}
	let content = source;
	const byOwner = new Map<number, PkfMetaMember[]>();
	for (const row of result.rows) {
		const ownerId = Number(row.ownerid);
		const members = byOwner.get(ownerId) ?? [];
		members.push({ kind: 'method', id: Number(row.id), name: row.name, aliases: row.aliases ?? '',
			visibility: metaVisibility(row.visibility), methodKind: Number(row.methkind),
			signature: decodeAuditText(row.signature), code: decodeAuditText(row.code) });
		byOwner.set(ownerId, members);
	}
	for (const [ownerId, members] of byOwner) {content = appendPkfMetaMembers(content, ownerId, members);}
	return content;
}

async function loadMetaPkf(client: PoolClient, database: string, fileId: number): Promise<string> {
	const ownerResult = await executeMonitoredQuery<MetaOwnerRow>(client, {
		// A default value belongs to DfltValues.SeniorID. Its AttrID may point to an
		// inherited attribute declared by any ancestor and must not change the PKF owner.
		text: metaPkfOwnerQuery,
		values: [fileId], source: 'Синхронизация пакетов: корневой класс meta-PKF', database,
	});
	const ownerId = requireSingleMetaOwner(ownerResult.rows.map(row => Number(row.id)), fileId);
	const classResult = await executeMonitoredQuery<MetaClassRow>(client, {
			text: `SELECT C.ID AS id, C.Name AS name, C.Aliases AS aliases, Parent.Name AS parentname,
			 C.Virtual AS virtual, C.CacheObjClass AS cacheobjclass, C.RefIntegrityCheck AS refintegritycheck
			 FROM Abstract A JOIN Classes C ON C.ID = A.ID LEFT JOIN Abstract Parent ON Parent.ID = C.SeniorID
			 WHERE C.ID = $1`, values: [ownerId], source: 'Синхронизация пакетов: класс meta-PKF', database,
		});
	const attributeResult = await executeMonitoredQuery<MetaAttributeRow>(client, {
			text: `SELECT Attr.ID AS id, Attr.Name AS name, Attr.Aliases AS aliases, Attr.Visibility AS visibility,
			 Attr.AttrType AS attrtype, ValueClass.Name AS valueclassname, Attr.DBFieldName AS dbfieldname,
			 Attr.RoleRead AS roleread, Attr.RoleWrite AS rolewrite, Attr.RefIntegrityCheck AS refintegritycheck
			 FROM Abstract A JOIN Attributes Attr ON Attr.ID = A.ID
			 LEFT JOIN Abstract ValueClass ON ValueClass.ID = NULLIF(split_part(COALESCE(Attr.ValueClasses, ''), ',', 1), '')::integer
			 WHERE A.SysFile = $1 ORDER BY Attr.ID`, values: [fileId], source: 'Синхронизация пакетов: атрибуты нового meta-PKF', database,
		});
	const defaultResult = await executeMonitoredQuery<MetaDefaultRow>(client, {
			text: `SELECT D.ID AS id, Attr.Name AS name, Attr.Visibility AS visibility, Attr.AttrType AS attrtype, D.DefValue AS defvalue
			 FROM Abstract A JOIN DfltValues D ON D.ID = A.ID JOIN Attributes Attr ON Attr.ID = D.AttrID
			 WHERE A.SysFile = $1 ORDER BY D.ID`, values: [fileId], source: 'Синхронизация пакетов: значения по умолчанию нового meta-PKF', database,
		});
	const methodResult = await executeMonitoredQuery<MetaMethodRow>(client, {
			text: `SELECT M.ID AS id, M.Name AS name, M.Aliases AS aliases, M.Visibility AS visibility,
			 M.MethKind AS methkind, M.Signature AS signature, M.Code AS code
			 FROM Abstract A JOIN Methods M ON M.ID = A.ID WHERE A.SysFile = $1 ORDER BY M.ID`,
			values: [fileId], source: 'Синхронизация пакетов: методы нового meta-PKF', database,
		});
	if (classResult.rows.length !== 1) {throw new Error(`Класс ID ${ownerId} для meta-PKF SysFile ${fileId} не найден.`);}
	if (attributeResult.rows.some(row => Number(row.attrtype) !== 330 || !row.valueclassname)) {
		throw new Error('Новый meta-PKF содержит атрибут не поддержанного декларативного типа.');
	}
	const root = classResult.rows[0]!;
	const members: PkfMetaMember[] = [
		...attributeResult.rows.map(row => ({
			kind: 'attribute' as const, id: Number(row.id), name: row.name, aliases: row.aliases ?? '', visibility: metaVisibility(row.visibility),
			valueClassName: row.valueclassname!, databaseFieldName: row.dbfieldname ?? '', readRole: nullableNumber(row.roleread),
			writeRole: nullableNumber(row.rolewrite), referenceIntegrityCheck: nullableNumber(row.refintegritycheck),
		})),
		...defaultResult.rows.map(row => {
			const value = decodeAuditText(row.defvalue);
			return { kind: 'default' as const, id: Number(row.id), name: row.name, visibility: metaVisibility(row.visibility), value, block: Number(row.attrtype) === BLOB_ATTRIBUTE_TYPE || /[\r\n]/u.test(value) };
		}),
		...methodResult.rows.map(row => ({
			kind: 'method' as const, id: Number(row.id), name: row.name, aliases: row.aliases ?? '', visibility: metaVisibility(row.visibility),
			methodKind: Number(row.methkind), signature: decodeAuditText(row.signature), code: decodeAuditText(row.code),
		})),
	];
	return serializePkfMetaFile({
		id: Number(root.id), name: root.name, aliases: root.aliases ?? '', parentName: root.parentname ?? '',
		isVirtual: Number(root.virtual) !== 0, cacheObjectClass: nullableNumber(root.cacheobjclass),
		referenceIntegrityCheck: nullableNumber(root.refintegritycheck),
	}, members);
}

async function buildDatabaseObjects(
	client: PoolClient,
	database: string,
	rows: readonly AbstractRow[],
): Promise<PkfDatabaseObject[]> {
	const objects: PkfDatabaseObject[] = [];
	const byClass = new Map<number, AbstractRow[]>();
	for (const row of rows) {
		const classRows = byClass.get(Number(row.classid)) ?? [];
		classRows.push(row);
		byClass.set(Number(row.classid), classRows);
	}
	for (const [classId, classObjects] of byClass) {
		objects.push(...await loadStoredDatabaseObjects(client, database, classId, classObjects));
	}
	return objects.sort((left, right) => left.id - right.id);
}

async function loadStoredDatabaseObjects(client: PoolClient, database: string, classId: number, objects: readonly AbstractRow[]): Promise<PkfDatabaseObject[]> {
	const classResult = await executeMonitoredQuery<ClassStorageRow>(client, {
		text: 'SELECT Name AS name, DBTableName AS dbtablename FROM Classes WHERE ID = $1', values: [classId],
		source: `Синхронизация пакетов: хранилище класса ${classId}`, database,
	});
	const classRow = classResult.rows[0];
	if (!classRow?.dbtablename || !/^[a-z_][a-z\d_$]*$/iu.test(classRow.dbtablename)) {throw new Error(`Для класса ID ${classId} не определена безопасная таблица хранения.`);}
	const attributeResult = await executeMonitoredQuery<StoredAttributeRow>(client, {
		text: `WITH RECURSIVE ClassTree(ID, SeniorID, Depth) AS (
		 SELECT ID, SeniorID, 0 FROM Classes WHERE ID = $1
		 UNION ALL SELECT C.ID, C.SeniorID, T.Depth + 1 FROM Classes C JOIN ClassTree T ON C.ID = T.SeniorID
		)
		SELECT Attr.ID AS id, Attr.Name AS name, Attr.DBFieldName AS dbfieldname, Attr.AttrType AS attrtype, T.Depth AS depth
		FROM Attributes Attr JOIN ClassTree T ON T.ID = Attr.SeniorID
		WHERE NULLIF(Attr.DBFieldName, '') IS NOT NULL ORDER BY T.Depth, Attr.ID`,
		values: [classId], source: `Синхронизация пакетов: атрибуты класса ${classId}`, database,
	});
	const rowResult = await executeMonitoredQuery<Record<string, unknown>>(client, {
		text: `SELECT * FROM ${classRow.dbtablename} WHERE ID = ANY($1::integer[])`, values: [objects.map(object => Number(object.id))],
		source: `Синхронизация пакетов: объекты класса ${classId} из ${classRow.dbtablename}`, database,
	});
	const storedById = new Map(rowResult.rows.map(row => [Number(row.id), row]));
	const attributesByField = new Map<string, StoredAttributeRow>();
	for (const attribute of attributeResult.rows) {
		const field = attribute.dbfieldname?.toLocaleLowerCase('en-US');
		if (field && !attributesByField.has(field)) {attributesByField.set(field, attribute);}
	}
	return objects.map(object => {
		const stored = storedById.get(Number(object.id));
		if (!stored) {throw new Error(`Объект ID ${object.id} не найден в таблице ${classRow.dbtablename}.`);}
		const fields = new Map(Object.entries(stored).map(([name, value]) => [name.toLocaleLowerCase('en-US'), value]));
		const properties = [...attributesByField].flatMap(([field, attribute]) => {
			if ([100, 101, 103, 105, 106].includes(Number(attribute.id))) {return [];}
			const rawValue = fields.get(field);
			if (rawValue === null || rawValue === undefined || rawValue === '') {return [];}
			const value = formatStoredValue(rawValue, Number(attribute.attrtype), attribute.name, Number(object.id));
			if (value === '') {return [];}
			return [{ attributeId: Number(attribute.id), name: attribute.name, value, format: /[\r\n]/u.test(value) ? 'block' as const : 'scalar' as const }];
		});
		return { id: Number(object.id), className: classRow.name, name: object.name ?? '$', properties };
	});
}

function decodeAuditText(value: unknown): string {
	if (Buffer.isBuffer(value)) {return iconv.decode(value, 'win1251');}
	const text = String(value ?? '');
	const bytea = text.match(/^\\x([\da-f]+)$/iu);
	return bytea ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}

function formatBoolean(value: string, attributeName: string, objectId: number): string {
	if (value === '-1' || value === '1' || value.toLocaleLowerCase('en-US') === 'true') {return 'true';}
	if (value === '0' || value.toLocaleLowerCase('en-US') === 'false') {return 'false';}
	throw new Error(`Булев атрибут ${attributeName} объекта ID ${objectId} содержит значение ${value}.`);
}

function formatStoredValue(value: unknown, attributeType: number, attributeName: string, objectId: number): string {
	if (attributeType === BOOLEAN_ATTRIBUTE_TYPE) {return formatBoolean(String(value), attributeName, objectId);}
	if (value instanceof Date) {
		const part = (number: number) => String(number).padStart(2, '0');
		return `${part(value.getDate())}.${part(value.getMonth() + 1)}.${value.getFullYear()} ${value.getHours()}:${part(value.getMinutes())}:${part(value.getSeconds())}`;
	}
	const text = Buffer.isBuffer(value) ? iconv.decode(value, 'win1251') : String(value);
	if (text.includes('\0') || text.includes('\uFFFD')) {throw new Error(`Атрибут ${attributeName} объекта ID ${objectId} содержит неподдерживаемые двоичные данные.`);}
	return text;
}

function metaVisibility(value: number | null): MetaVisibility {
	if (Number(value) === 12450284) {return 'protected';}
	if (Number(value) === 12450285) {return 'private';}
	if (Number(value) === 12450287) {return 'published';}
	return 'public';
}

function nullableNumber(value: number | null): number | null {return value === null ? null : Number(value);}

function isFileNotFound(error: unknown): boolean {return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';}
