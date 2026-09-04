import { Client } from 'pg';
import * as iconv from 'iconv-lite';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { getSessionContext } from '../../infrastructure/configuration/sessionContext';
import { executeMonitoredQuery } from '../../infrastructure/database/databaseQueryExecutor';

export interface DfmSource {
	classId: number;
	className: string;
	attributeId: number;
	valueId: number;
	valueName: string;
	text: string;
	valueType: string;
}

interface DfmRow {
	classid: number;
	classname: string;
	attrid: number;
	valueid: number | null;
	valuename: string | null;
	defvalue: unknown;
	valuetype: string;
}

const dfmQuery = `WITH RECURSIVE class_chain AS (
	SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
	UNION ALL
	SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
	FROM classes parent JOIN class_chain chain ON parent.id = chain.seniorid
	WHERE NOT parent.id = ANY(chain.path)
), dfm_attribute AS (
	SELECT attribute.id, chain.depth
	FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
	WHERE upper(attribute.name) = 'DFM'
	ORDER BY chain.depth LIMIT 1
)
SELECT class.id AS classid, class.name AS classname, attribute.id AS attrid,
	value.id AS valueid, value.name AS valuename, value.defvalue,
	pg_typeof(value.defvalue)::text AS valuetype
FROM classes class CROSS JOIN dfm_attribute attribute
LEFT JOIN dfltvalues value ON value.seniorid = class.id AND value.attrid = attribute.id
WHERE class.id = $1`;

export async function getDfmSource(classId: number): Promise<DfmSource> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<DfmRow, [number]>(client, {
			text: dfmQuery, values: [classId], source: `DFM класса ${classId}`, database: options.database,
		});
		const row = result.rows[0];
		if (!row) throw new Error(`У класса ${classId} не найден атрибут DFM.`);
		if (row.valueid === null) throw new Error(`У класса ${row.classname} нет собственного значения DFM.`);
		return toSource(row);
	} finally { await client.end().catch(() => undefined); }
}

export async function getDfmInheritance(classId: number): Promise<DfmSource[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<DfmRow & { depth: number }, [number]>(client, {
			text: `WITH RECURSIVE class_chain AS (
			  SELECT id, name, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
			  UNION ALL
			  SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
			  FROM classes parent JOIN class_chain chain ON parent.id = chain.seniorid
			  WHERE NOT parent.id = ANY(chain.path)
			), dfm_attributes AS (
			  SELECT attribute.id FROM class_chain chain
			  JOIN attributes attribute ON attribute.seniorid = chain.id
			  WHERE upper(attribute.name) = 'DFM'
			)
			SELECT chain.id AS classid, chain.name AS classname, value.attrid,
			  value.id AS valueid, value.name AS valuename, value.defvalue,
			  pg_typeof(value.defvalue)::text AS valuetype, chain.depth
			FROM class_chain chain
			JOIN dfltvalues value ON value.seniorid = chain.id
			WHERE value.attrid IN (SELECT id FROM dfm_attributes)
			ORDER BY chain.depth DESC`,
			values: [classId], source: `Цепочка DFM класса ${classId}`, database: options.database,
		});
		if (!result.rows.length) throw new Error(`В иерархии класса ${classId} не найден DFM.`);
		return result.rows.map(toSource);
	} finally { await client.end().catch(() => undefined); }
}

export async function saveDfmSource(source: DfmSource, text: string): Promise<DfmSource> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		await client.query('BEGIN');
		const current = await executeMonitoredQuery<DfmRow, [number]>(client, {
			text: dfmQuery, values: [source.classId], source: `Проверка DFM класса ${source.classId}`, database: options.database,
		});
		const row = current.rows[0];
		if (!row || row.valueid !== source.valueId || row.attrid !== source.attributeId) throw new Error('Запись DFM изменилась или была удалена. Откройте её заново.');
		if (decodeValue(row.defvalue) === text) { await client.query('ROLLBACK'); return toSource(row); }
		const session = await getSessionContext(client, options.database);
		const value = isBinaryType(row.valuetype) ? encode(text) : text;
		const updated = await executeMonitoredQuery(client, {
			text: `UPDATE dfltvalues SET lastchange = $1, seniorid = $2, attrid = $3, defvalue = $4, name = $5 WHERE id = $6`,
			values: [session.changeDate, source.classId, source.attributeId, value, source.valueName, source.valueId],
			source: `Сохранение DFM класса ${source.className}`, database: options.database,
		});
		if (updated.rowCount !== 1) throw new Error('Запись DFM не найдена при сохранении.');
		const abstractUpdated = await executeMonitoredQuery(client, {
			text: `UPDATE abstract SET lastchange = $1, seniorid = $2, name = $3 WHERE id = $4`,
			values: [session.changeDate, source.classId, source.valueName, source.valueId],
			source: `Сохранение abstract DFM ${source.valueId}`, database: options.database,
		});
		if (abstractUpdated.rowCount !== 1) throw new Error('Запись abstract для DFM не найдена.');
		const reread = await executeMonitoredQuery<DfmRow, [number]>(client, {
			text: dfmQuery, values: [source.classId], source: `Повторное чтение DFM класса ${source.classId}`, database: options.database,
		});
		const saved = reread.rows[0];
		if (!saved || decodeValue(saved.defvalue) !== text) throw new Error('Проверка сохранённого DFM не пройдена.');
		await client.query('COMMIT');
		return toSource(saved);
	} catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
	finally { await client.end().catch(() => undefined); }
}

function toSource(row: DfmRow): DfmSource {
	return { classId: row.classid, className: row.classname, attributeId: row.attrid, valueId: row.valueid!, valueName: row.valuename ?? 'DFM', text: decodeValue(row.defvalue), valueType: row.valuetype };
}
function decodeValue(value: unknown): string {
	if (Buffer.isBuffer(value)) return iconv.decode(value, 'win1251');
	const text = value == null ? '' : String(value);
	const bytea = text.match(/^\\x([\da-f]+)$/i);
	return bytea ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}
function encode(value: string): Buffer {
	const result = iconv.encode(value, 'win1251');
	if (iconv.decode(result, 'win1251') !== value) throw new Error('DFM содержит символы вне Windows-1251.');
	return result;
}
function isBinaryType(value: string): boolean { return value.toLowerCase() === 'bytea' || value.toLowerCase() === 'bin'; }
