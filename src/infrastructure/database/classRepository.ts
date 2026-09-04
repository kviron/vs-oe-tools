import { Client } from 'pg';
import * as iconv from 'iconv-lite';
import type { AttributeDetails, ClassAttribute, ClassCommentRow, ClassDetails, ClassMethod, ClassProperty, ClassRow, ClassTreeRow, ObjectMetaDataCountRow, PropertyDetails } from '../../features/classes/models';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { executeMonitoredQuery } from './databaseQueryExecutor';

export async function testDatabaseConnection(): Promise<{ database: string; user: string }> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({
		...options,
		application_name: 'vc-ve-tools',
		connectionTimeoutMillis: 5000,
	});

	try {
		await client.connect();
		const result = await executeMonitoredQuery<{ database: string; user: string }>(client, {
			text: 'SELECT current_database() AS database, current_user AS user',
			source: 'Проверка подключения',
			database: options.database,
		});
		const row = result.rows[0];
		if (!row) {
			throw new Error('База не вернула результат проверки.');
		}
		return row;
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function loadClasses(): Promise<ClassTreeRow[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({
		...options,
		application_name: 'vc-ve-tools',
		connectionTimeoutMillis: 5000,
	});

	try {
		await client.connect();
		const classesResult = await executeMonitoredQuery<ClassRow>(client, {
			text: `SELECT class.id, class.name, class.seniorid, class.ord, class.virtual, class.dbtablename,
			 EXISTS (
			   SELECT 1 FROM dfltvalues value
			   JOIN attributes attribute ON attribute.id = value.attrid
			   WHERE value.seniorid = class.id AND upper(attribute.name) = 'DFM'
			 ) AS "hasDfm"
			 FROM classes class
			 ORDER BY ord NULLS LAST, name`,
			source: 'Загрузка классов',
			database: options.database,
		});
		const commentsResult = await executeMonitoredQuery<ClassCommentRow>(client, {
			text: `SELECT comments.id, comments.name, comments.seniorid, comments.ord
			 FROM objcomments AS comments
			 INNER JOIN classes ON classes.id = comments.seniorid
			 ORDER BY comments.ord NULLS LAST, comments.name`,
			source: 'Загрузка комментариев классов',
			database: options.database,
		});
		const metaDataCountsResult = await executeMonitoredQuery<ObjectMetaDataCountRow>(client, {
			text: `SELECT map.seniorid, COUNT(map.id) AS count
			 FROM objectmetadatamap AS map
			 INNER JOIN classes ON classes.id = map.seniorid
			 WHERE map.metaobjectclassid = 5
			 GROUP BY map.seniorid`,
			source: 'Подсчёт метаданных классов',
			database: options.database,
		});

		const commentsBySeniorId = new Map<number, ClassCommentRow[]>();
		for (const comment of commentsResult.rows) {
			const comments = commentsBySeniorId.get(comment.seniorid) ?? [];
			comments.push(comment);
			commentsBySeniorId.set(comment.seniorid, comments);
		}
		const metaDataCountBySeniorId = new Map(
			metaDataCountsResult.rows.map((item) => [item.seniorid, Number(item.count)]),
		);

		return classesResult.rows.map((classRow) => ({
			...classRow,
			comments: commentsBySeniorId.get(classRow.id) ?? [],
			objectMetaDataCount: metaDataCountBySeniorId.get(classRow.id) ?? 0,
		}));
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function getClassDetails(id: number): Promise<ClassDetails> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	let classDetails: ClassDetails | undefined;
	try {
		await client.connect();
		const result = await executeMonitoredQuery<ClassDetails, [number]>(client, {
			text: `SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
			 FROM classes AS class
			 LEFT JOIN classes AS child ON child.id = class.childclassid
			 LEFT JOIN classes AS parent ON parent.id = class.parentclassid
			 WHERE class.id = $1`,
			values: [id],
			source: 'Данные класса',
			database: options.database,
		});
		classDetails = result.rows[0];
	} finally {
		await client.end().catch(() => undefined);
	}

	if (!classDetails) {
		throw new Error('Класс не найден в базе.');
	}
	return classDetails;
}

interface AttributeTableInfo {
	table_schema: string;
	table_name: string;
	columns: string[];
}

function quoteIdentifier(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function readValue(row: Record<string, unknown>, ...names: string[]): string {
	const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
	for (const name of names) {
		const value = values.get(name);
		if (value !== undefined && value !== null) return String(value);
	}
	return '';
}

interface ClassAttributeRow {
	data: Record<string, unknown>;
	ownername: string | null;
	depth: number;
}

interface ObjectCreatorRow {
	objid: string;
	userid: string | null;
	userdata?: Record<string, unknown> | null;
}

interface ObjectCreator {
	name: string;
}

interface UserTableInfo {
	table_schema: string;
	table_name: string;
	id_column: string;
}

const attributeTableCache = new Map<string, Promise<AttributeTableInfo | undefined>>();
const userTableCache = new Map<string, Promise<UserTableInfo | undefined>>();

function databaseCacheKey(options: { host?: string; port?: number; database?: string; user?: string }): string {
	return `${options.host ?? ''}:${options.port ?? ''}/${options.database ?? ''}/${options.user ?? ''}`;
}

function cachedLookup<T>(cache: Map<string, Promise<T>>, key: string, lookup: () => Promise<T>): Promise<T> {
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}
	const pending = lookup().catch((error: unknown) => {
		cache.delete(key);
		throw error;
	});
	cache.set(key, pending);
	return pending;
}

export async function getClassAttributes(classId: number, className: string, includeInherited: boolean): Promise<ClassAttribute[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const cacheKey = databaseCacheKey(options);
		const table = await cachedLookup(attributeTableCache, cacheKey, async () => {
			const tables = await executeMonitoredQuery<AttributeTableInfo>(client, {
				text: `SELECT table_schema, table_name, array_agg(lower(column_name)) AS columns
			 FROM information_schema.columns
			 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
			 GROUP BY table_schema, table_name
			 HAVING lower(table_name) LIKE '%attr%'
			    AND bool_or(lower(column_name) = 'id')
			    AND bool_or(lower(column_name) = 'name')
			    AND bool_or(lower(column_name) IN ('seniorid', 'classid', 'ownerid'))
			 ORDER BY CASE lower(table_name)
			   WHEN 'attributes' THEN 0 WHEN 'classattributes' THEN 1 WHEN 'objattributes' THEN 2 ELSE 3 END,
			   table_name`,
			source: 'Поиск таблицы атрибутов',
				database: options.database,
			});
			return tables.rows[0];
		});
		if (!table) {
			throw new Error('В схеме базы данных не найдена таблица атрибутов классов.');
		}

		const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
		if (!ownerColumn) {
			throw new Error('В таблице атрибутов не найдена ссылка на класс.');
		}
		const orderColumn = ['ord', 'line', 'linenumber', 'name'].find(column => table.columns.includes(column)) ?? 'id';
		const source = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
		const text = includeInherited
			? `WITH RECURSIVE class_chain AS (
			     SELECT class.id, class.seniorid, class.name, 0 AS depth, ARRAY[class.id] AS path
			     FROM classes AS class
			     WHERE class.id = $1
			     UNION ALL
			     SELECT parent.id, parent.seniorid, parent.name, chain.depth + 1, chain.path || parent.id
			     FROM classes AS parent
			     INNER JOIN class_chain AS chain ON parent.id = chain.seniorid
			     WHERE NOT parent.id = ANY(chain.path)
			   )
			   SELECT to_jsonb(attribute) AS data, COALESCE(chain.name, $2::text) AS ownername, chain.depth
			   FROM class_chain AS chain
			   INNER JOIN ${source} AS attribute ON attribute.${quoteIdentifier(ownerColumn)} = chain.id
			   ORDER BY chain.depth, attribute.${quoteIdentifier(orderColumn)} NULLS LAST, attribute.${quoteIdentifier('id')}`
			: `SELECT to_jsonb(attribute) AS data, $2::text AS ownername, 0 AS depth
			   FROM ${source} AS attribute
			   WHERE attribute.${quoteIdentifier(ownerColumn)} = $1
			   ORDER BY attribute.${quoteIdentifier(orderColumn)} NULLS LAST, attribute.${quoteIdentifier('id')}`;
		const result = await executeMonitoredQuery<ClassAttributeRow, [number, string]>(client, {
			text,
			values: [classId, className],
			source: includeInherited ? `Атрибуты класса ${className} с наследованием` : `Атрибуты класса ${className}`,
			database: options.database,
		});

		const creators = await getObjectCreators(client, options.database, cacheKey, result.rows.map(row => readValue(row.data, 'id')), 4);
		const attributes = result.rows.map(({ data, ownername, depth }) => ({
			id: readValue(data, 'id'),
			name: readValue(data, 'name'),
			owner: ownername ?? (readValue(data, 'owner', 'ownername', 'classname') || className),
			signature: readValue(data, 'signature', 'parameters', 'params', 'args', 'declaration'),
			type: readValue(data, 'type', 'typename', 'attrtype', 'attributetype', 'kind'),
			visibility: readValue(data, 'visibility', 'access', 'scope'),
			package: readValue(data, 'package', 'packagename'),
			line: readValue(data, 'line', 'linenumber', 'row', 'rownum'),
			updatedAt: readValue(data, 'lastchange', 'updatedate', 'updatedat', 'modifieddate'),
			createdBy: creators.get(readValue(data, 'id'))?.name ?? '',
			inherited: depth > 0,
		}));
		if (!includeInherited) {
			return attributes;
		}

		const visibleAttributes = new Map<string, ClassAttribute>();
		for (const attribute of attributes) {
			const key = attribute.name.toLocaleUpperCase('ru');
			if (!visibleAttributes.has(key)) {
				visibleAttributes.set(key, attribute);
			}
		}
		return [...visibleAttributes.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function getClassAttributeDetails(attributeId: number): Promise<AttributeDetails> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const cacheKey = databaseCacheKey(options);
		const table = await cachedLookup(attributeTableCache, cacheKey, async () => {
			const tables = await executeMonitoredQuery<AttributeTableInfo>(client, {
				text: `SELECT table_schema, table_name, array_agg(lower(column_name)) AS columns
				 FROM information_schema.columns
				 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
				 GROUP BY table_schema, table_name
				 HAVING lower(table_name) LIKE '%attr%'
				    AND bool_or(lower(column_name) = 'id')
				    AND bool_or(lower(column_name) = 'name')
				    AND bool_or(lower(column_name) IN ('seniorid', 'classid', 'ownerid'))
				 ORDER BY CASE lower(table_name)
				   WHEN 'attributes' THEN 0 WHEN 'classattributes' THEN 1 WHEN 'objattributes' THEN 2 ELSE 3 END,
				   table_name`,
				source: 'Поиск таблицы атрибутов',
				database: options.database,
			});
			return tables.rows[0];
		});
		if (!table) {
			throw new Error('В схеме базы данных не найдена таблица атрибутов классов.');
		}
		const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
		if (!ownerColumn) {
			throw new Error('В таблице атрибутов не найдена ссылка на класс.');
		}
		const source = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
		const typeJoin = table.columns.includes('attrtype') ? 'LEFT JOIN classes AS attribute_type ON attribute_type.id = attribute.attrtype' : '';
		const typeColumn = table.columns.includes('attrtype') ? ', attribute_type.name AS attributetypename' : ", ''::text AS attributetypename";
		const result = await executeMonitoredQuery<{ data: Record<string, unknown>; ownerclassid: string; ownerclassname: string; attributetypename: string }, [number]>(client, {
			text: `SELECT to_jsonb(attribute) AS data, owner.id AS ownerclassid, owner.name AS ownerclassname${typeColumn}
			 FROM ${source} AS attribute
			 LEFT JOIN classes AS owner ON owner.id = attribute.${quoteIdentifier(ownerColumn)}
			 ${typeJoin}
			 WHERE attribute.id = $1`,
			values: [attributeId],
			source: `Карточка атрибута ${attributeId}`,
			database: options.database,
		});
		const row = result.rows[0];
		if (!row) {
			throw new Error(`Атрибут ${attributeId} не найден.`);
		}
		const creators = await getObjectCreators(client, options.database, cacheKey, [String(attributeId)], 4);
		return {
			id: readValue(row.data, 'id'),
			name: decodeDatabaseText(readValue(row.data, 'name')),
			ownerClassId: String(row.ownerclassid ?? ''),
			ownerClassName: row.ownerclassname ?? '',
			attributeTypeName: row.attributetypename ?? '',
			createdBy: creators.get(String(attributeId))?.name ?? '',
			data: decodeAttributeData(row.data),
		};
	} finally {
		await client.end().catch(() => undefined);
	}
}

interface ClassMethodRow {
	data: Record<string, unknown>;
	ownername: string | null;
	depth: number;
}

interface ClassPropertyRow {
	id: string;
	propname: string;
	propaliases: string | null;
	propseniorid: string | null;
	proponlyread: string | null;
	propvisibility: string | null;
	proppackage: string | null;
	depth: number;
}

export async function getClassProperties(classId: number, includeInherited: boolean): Promise<ClassProperty[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<ClassPropertyRow, [number]>(client, {
			text: `WITH RECURSIVE class_chain AS (
			         SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
			         UNION ALL
			         SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
			         FROM classes AS parent JOIN class_chain AS chain ON chain.seniorid = parent.id
			         WHERE NOT parent.id = ANY(chain.path)
			       )
			       SELECT property.id::text,
			              property.name AS propname,
			              property.aliases AS propaliases,
			              owner.name AS propseniorid,
			              CASE WHEN NULLIF(property.writemember, 0) IS NULL THEN 'Да' END AS proponlyread,
			              visibility.name AS propvisibility,
			              package.packagename AS proppackage,
			              chain.depth
			       FROM class_chain AS chain
			       JOIN properties AS property ON property.seniorid = chain.id
			       LEFT JOIN abstract AS owner ON owner.id = property.seniorid
			       LEFT JOIN enum AS visibility ON visibility.classid = 12450282
			         AND ((visibility.id = 12450286 AND (NULLIF(property.visibility, 0) IS NULL OR property.visibility = 12450283))
			           OR (property.visibility <> 12450283 AND visibility.id = property.visibility))
			       LEFT JOIN abstract AS abstract_property ON abstract_property.id = property.id
			       LEFT JOIN sysfile AS file ON file.id = abstract_property.sysfile
			       LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			       LEFT JOIN syspackages AS package ON package.id = file_group.package
			       WHERE $1 = chain.id OR ${includeInherited ? 'chain.depth > 0' : 'FALSE'}
			       ORDER BY lower(property.name), chain.depth, property.id`,
			values: [classId], source: `Свойства класса ${classId}${includeInherited ? ' с наследованием' : ''}`, database: options.database,
		});
		const visible = new Map<string, ClassProperty>();
		for (const row of result.rows) {
			const property: ClassProperty = {
				id: row.id,
				name: decodeDatabaseText(row.propname),
				aliases: decodeDatabaseText(row.propaliases ?? ''),
				owner: row.propseniorid ?? '',
				type: '',
				readOnly: row.proponlyread === 'Да',
				visibility: row.propvisibility ?? '',
				package: row.proppackage ?? '',
				inherited: row.depth > 0,
			};
			const key = property.name.toLocaleUpperCase('ru');
			if (!visible.has(key)) {
				visible.set(key, property);
			}
		}
		return [...visible.values()];
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function getClassPropertyDetails(propertyId: number): Promise<PropertyDetails> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<{
			id: string; name: string; aliases: string | null; ownerclassid: string; ownerclassname: string | null;
			visibility: string | null; readmemberid: string | null; readmembername: string | null;
			writememberid: string | null; writemembername: string | null;
		}, [number]>(client, {
			text: `SELECT property.id::text, property.name, property.aliases,
			              owner.id::text AS ownerclassid, owner.name AS ownerclassname,
			              visibility.name AS visibility,
			              property.readmember::text AS readmemberid, read_member.name AS readmembername,
			              property.writemember::text AS writememberid, write_member.name AS writemembername
			       FROM properties AS property
			       LEFT JOIN abstract AS owner ON owner.id = property.seniorid
			       LEFT JOIN abstract AS read_member ON read_member.id = property.readmember
			       LEFT JOIN abstract AS write_member ON write_member.id = property.writemember
			       LEFT JOIN enum AS visibility ON visibility.classid = 12450282
			         AND ((visibility.id = 12450286 AND (NULLIF(property.visibility, 0) IS NULL OR property.visibility = 12450283))
			           OR (property.visibility <> 12450283 AND visibility.id = property.visibility))
			       WHERE property.id = $1`,
			values: [propertyId], source: `Карточка свойства ${propertyId}`, database: options.database,
		});
		const row = result.rows[0];
		if (!row) {
			throw new Error(`Свойство ${propertyId} не найдено.`);
		}
		return {
			id: row.id, name: decodeDatabaseText(row.name), aliases: decodeDatabaseText(row.aliases ?? ''),
			visibility: row.visibility ?? '', ownerClassId: row.ownerclassid, ownerClassName: row.ownerclassname ?? '',
			readMemberId: row.readmemberid ?? '', readMemberName: row.readmembername ?? '',
			writeMemberId: row.writememberid ?? '', writeMemberName: row.writemembername ?? '',
		};
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function getClassMethods(classId: number, className: string, includeInherited: boolean): Promise<ClassMethod[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const text = includeInherited
			? `WITH RECURSIVE class_chain AS (
			     SELECT class.id, class.seniorid, 0 AS depth, ARRAY[class.id] AS path
			     FROM classes AS class
			     WHERE class.id = $1
			     UNION ALL
			     SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
			     FROM classes AS parent
			     INNER JOIN class_chain AS chain ON parent.id = chain.seniorid
			     WHERE NOT parent.id = ANY(chain.path)
			   )
			   SELECT to_jsonb(method) AS data, owner.name AS ownername, chain.depth
			   FROM class_chain AS chain
			   INNER JOIN methods AS method ON method.seniorid = chain.id
			   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
			   ORDER BY chain.depth, lower(method.name), method.id`
			: `SELECT to_jsonb(method) AS data, owner.name AS ownername, 0 AS depth
			   FROM methods AS method
			   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
			   WHERE method.seniorid = $1
			   ORDER BY lower(method.name), method.id`;
		const result = await executeMonitoredQuery<ClassMethodRow, [number]>(client, {
			text,
			values: [classId],
			source: includeInherited ? `Методы класса ${className} с наследованием` : `Методы класса ${className}`,
			database: options.database,
		});

		const creators = await getObjectCreators(client, options.database, databaseCacheKey(options), result.rows.map(row => readValue(row.data, 'id')), 5);
		const methods = result.rows.map(({ data, ownername, depth }) => ({
			id: readValue(data, 'id'),
			name: readValue(data, 'name', 'methname'),
			owner: ownername ?? (readValue(data, 'owner', 'ownername', 'classname') || className),
			signature: decodeDatabaseText(readValue(data, 'signature', 'methsignature', 'parameters', 'params')),
			type: methodTypeName(readValue(data, 'methtype', 'type', 'typename')),
			visibility: readValue(data, 'visibility', 'visible', 'access', 'scope'),
			package: readValue(data, 'package', 'packagename'),
			line: readValue(data, 'line', 'linenumber', 'row', 'rownum'),
			updatedAt: readValue(data, 'lastchange', 'updatedate', 'updatedat', 'modifieddate'),
			createdBy: creators.get(readValue(data, 'id'))?.name ?? '',
			inherited: depth > 0,
		}));
		if (!includeInherited) {
			return methods;
		}

		const visibleMethods = new Map<string, ClassMethod>();
		for (const method of methods) {
			const key = method.name.toLocaleUpperCase('ru');
			if (!visibleMethods.has(key)) {
				visibleMethods.set(key, method);
			}
		}
		return [...visibleMethods.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
	} finally {
		await client.end().catch(() => undefined);
	}
}

async function getObjectCreators(client: Client, database: string, cacheKey: string, objectIds: string[], objectClassId: number): Promise<Map<string, ObjectCreator>> {
	const ids = objectIds.map(Number).filter(Number.isSafeInteger);
	if (ids.length === 0) {
		return new Map();
	}
	const userTable = await cachedLookup(userTableCache, cacheKey, () => findUserTable(client, database)).catch(() => undefined);
	const userJoin = userTable
		? `LEFT JOIN ${quoteIdentifier(userTable.table_schema)}.${quoteIdentifier(userTable.table_name)} AS creator_user ON creator_user.${quoteIdentifier(userTable.id_column)} = creator_log.userid`
		: '';
	const userColumn = userTable ? ', to_jsonb(creator_user) AS userdata' : '';
	const result = await executeMonitoredQuery<ObjectCreatorRow, [number[], number]>(client, {
		text: `SELECT DISTINCT ON (creator_log.objid)
		        creator_log.objid, creator_log.userid${userColumn}
		 FROM logcchangedobject AS creator_log
		 ${userJoin}
		 WHERE creator_log.objid = ANY($1::bigint[]) AND creator_log.objclassid = $2
		 ORDER BY creator_log.objid,
		          CASE WHEN creator_log.changetype = 1 THEN 0 ELSE 1 END,
		          creator_log.changedate`,
		values: [ids, objectClassId],
		source: `Создатели объектов класса ${objectClassId}`,
		database,
	});
	return new Map(result.rows.map(row => [String(row.objid), {
		name: formatAuditUser(row.userid, row.userdata),
	}]));
}

async function findUserTable(client: Client, database: string): Promise<UserTableInfo | undefined> {
	const result = await executeMonitoredQuery<UserTableInfo>(client, {
		text: `SELECT table_schema, table_name,
		        min(column_name) FILTER (WHERE lower(column_name) = 'id') AS id_column
		 FROM information_schema.columns
		 WHERE lower(table_name) = 'users'
		 GROUP BY table_schema, table_name
		 HAVING bool_or(lower(column_name) = 'id')
		 ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema
		 LIMIT 1`,
		source: 'Поиск пользователей для создателей объектов',
		database,
	});
	return result.rows[0];
}

function formatAuditUser(userId: string | null, userData?: Record<string, unknown> | null): string {
	const name = decodeDatabaseText(readValue(userData ?? {}, 'username', 'fullname', 'name', 'fio'));
	const login = decodeDatabaseText(readValue(userData ?? {}, 'loginname', 'login', 'userlogin'));
	if (name && login && name !== login) {
		return `${name} (${login})`;
	}
	return name || login || (userId ? `Пользователь ${userId}` : '');
}

function methodTypeName(value: string): string {
	switch (value) {
		case '1': return 'Объектный';
		case '2': return 'Внешняя процедура';
		case '3': return 'Интерпретируемый';
		case '4': return 'Visual Basic';
		case '5': return 'Java';
		default: return value;
	}
}

function decodeDatabaseText(value: string): string {
	const bytea = value.match(/^\\x([\da-f]+)$/i);
	if (!bytea || bytea[1].length % 2 !== 0) {
		return value;
	}
	return iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251');
}

function decodeAttributeData(data: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? decodeDatabaseText(value) : value]));
}
