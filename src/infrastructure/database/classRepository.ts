import { Client } from 'pg';
import type { ClassAttribute, ClassCommentRow, ClassDetails, ClassRow, ClassTreeRow, ObjectMetaDataCountRow } from '../../features/classes/models';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';

export async function testDatabaseConnection(): Promise<{ database: string; user: string }> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({
		...options,
		application_name: 'vc-ve-tools',
		connectionTimeoutMillis: 5000,
	});

	try {
		await client.connect();
		const result = await client.query<{ database: string; user: string }>(
			'SELECT current_database() AS database, current_user AS user',
		);
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
		const classesResult = await client.query<ClassRow>(
			`SELECT id, name, seniorid, ord
			 FROM classes
			 ORDER BY ord NULLS LAST, name`,
		);
		const commentsResult = await client.query<ClassCommentRow>(
			`SELECT comments.id, comments.name, comments.seniorid, comments.ord
			 FROM objcomments AS comments
			 INNER JOIN classes ON classes.id = comments.seniorid
			 ORDER BY comments.ord NULLS LAST, comments.name`,
		);
		const metaDataCountsResult = await client.query<ObjectMetaDataCountRow>(
			`SELECT map.seniorid, COUNT(map.id) AS count
			 FROM objectmetadatamap AS map
			 INNER JOIN classes ON classes.id = map.seniorid
			 WHERE map.metaobjectclassid = 5
			 GROUP BY map.seniorid`,
		);

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
		const result = await client.query<ClassDetails>(
			`SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
			 FROM classes AS class
			 LEFT JOIN classes AS child ON child.id = class.childclassid
			 LEFT JOIN classes AS parent ON parent.id = class.parentclassid
			 WHERE class.id = $1`,
			[id],
		);
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

export async function getClassAttributes(classId: number, className: string): Promise<ClassAttribute[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const tables = await client.query<AttributeTableInfo>(
			`SELECT table_schema, table_name, array_agg(lower(column_name)) AS columns
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
		);
		const table = tables.rows[0];
		if (!table) throw new Error('В схеме базы данных не найдена таблица атрибутов классов.');

		const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
		if (!ownerColumn) throw new Error('В таблице атрибутов не найдена ссылка на класс.');
		const orderColumn = ['ord', 'line', 'linenumber', 'name'].find(column => table.columns.includes(column)) ?? 'id';
		const source = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
		const result = await client.query<{ data: Record<string, unknown> }>(
			`SELECT to_jsonb(attribute) AS data
			 FROM ${source} AS attribute
			 WHERE attribute.${quoteIdentifier(ownerColumn)} = $1
			 ORDER BY attribute.${quoteIdentifier(orderColumn)} NULLS LAST, attribute.${quoteIdentifier('id')}`,
			[classId],
		);

		return result.rows.map(({ data }) => ({
			id: readValue(data, 'id'),
			name: readValue(data, 'name'),
			owner: readValue(data, 'owner', 'ownername', 'classname') || className,
			signature: readValue(data, 'signature', 'parameters', 'params', 'args', 'declaration'),
			type: readValue(data, 'type', 'typename', 'attributetype', 'kind'),
			visibility: readValue(data, 'visibility', 'access', 'scope'),
			package: readValue(data, 'package', 'packagename'),
			line: readValue(data, 'line', 'linenumber', 'row', 'rownum'),
		}));
	} finally {
		await client.end().catch(() => undefined);
	}
}
