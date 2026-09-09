import { Client } from 'pg';
import * as iconv from 'iconv-lite';
import type { DatabaseObjectKind } from '../../core/objectSearch';
import type { PackageContentNode, PackageExplorerNode, PackageFileContent, PackageSummary } from '../../features/packages/models';
import { buildPackageTree, type PackageFileRow, type PackageGroupRow } from '../../features/packages/packageTree';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { executeMonitoredQuery } from './databaseQueryExecutor';

interface PackageRow { id: string; packagename: string }
interface FileIdentityRow { id: string; filename: string; grouppath: string | null; packagename: string }
interface FileObjectRow {
	id: string; name: string; seniorid: string | null; classid: string; classname: string | null;
	isclass: boolean; ismethod: boolean; isattribute: boolean;
}

export async function loadPackages(): Promise<PackageSummary[]> {
	return withDatabase(async (client, database) => {
		const result = await executeMonitoredQuery<PackageRow>(client, {
			text: `SELECT id::text, packagename FROM syspackages ORDER BY lower(packagename), id`,
			source: 'Пакеты проводника', database,
		});
		return result.rows.map(row => ({ id: Number(row.id), name: decodeText(row.packagename) }));
	});
}

export async function loadPackageTree(packageId: number): Promise<PackageExplorerNode> {
	return withDatabase(async (client, database) => {
		const packageResult = await executeMonitoredQuery<PackageRow, [number]>(client, {
			text: `SELECT id::text, packagename FROM syspackages WHERE id = $1`, values: [packageId],
			source: `Пакет ${packageId}`, database,
		});
		const packageRow = packageResult.rows[0];
		if (!packageRow) { throw new Error(`Пакет ${packageId} не найден.`); }
		const groups = await executeMonitoredQuery<PackageGroupRow, [number]>(client, {
			text: `SELECT id::text, groupname, path FROM sysgroups WHERE package = $1 ORDER BY lower(path), lower(groupname), id`,
			values: [packageId], source: `Группы пакета ${decodeText(packageRow.packagename)}`, database,
		});
		const files = await executeMonitoredQuery<PackageFileRow, [number]>(client, {
			text: `SELECT file.id::text, file.filename, file.sysgroup::text,
			              count(object.id)::text AS objectcount
			       FROM sysfile AS file
			       JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			       LEFT JOIN abstract AS object ON object.sysfile = file.id
			       WHERE file_group.package = $1
			       GROUP BY file.id, file.filename, file.sysgroup
			       ORDER BY lower(file.filename), file.id`,
			values: [packageId], source: `Файлы пакета ${decodeText(packageRow.packagename)}`, database,
		});
		return buildPackageTree(
			Number(packageRow.id), decodeText(packageRow.packagename),
			groups.rows.map(row => ({ ...row, groupname: decodeText(row.groupname), path: row.path === null ? null : decodeText(row.path) })),
			files.rows.map(row => ({ ...row, filename: decodeText(row.filename) })),
		);
	});
}

export async function loadPackageFileContent(fileId: number): Promise<PackageFileContent> {
	return withDatabase(async (client, database) => {
		const fileResult = await executeMonitoredQuery<FileIdentityRow, [number]>(client, {
			text: `SELECT file.id::text, file.filename, file_group.path AS grouppath, package.packagename
			       FROM sysfile AS file
			       JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			       JOIN syspackages AS package ON package.id = file_group.package
			       WHERE file.id = $1`,
			values: [fileId], source: `Файл пакета ${fileId}`, database,
		});
		const file = fileResult.rows[0];
		if (!file) { throw new Error(`Файл пакета ${fileId} не найден.`); }
		const objects = await executeMonitoredQuery<FileObjectRow, [number]>(client, {
			text: `SELECT object.id::text, object.name, object.seniorid::text, object.classid::text,
			              meta_class.name AS classname,
			              (entity_class.id IS NOT NULL) AS isclass,
			              (method.id IS NOT NULL) AS ismethod,
			              (attribute.id IS NOT NULL) AS isattribute
			       FROM abstract AS object
			       LEFT JOIN classes AS meta_class ON meta_class.id = object.classid
			       LEFT JOIN classes AS entity_class ON entity_class.id = object.id
			       LEFT JOIN methods AS method ON method.id = object.id
			       LEFT JOIN attributes AS attribute ON attribute.id = object.id
			       WHERE object.sysfile = $1
			       ORDER BY object.ord NULLS LAST, lower(object.name), object.id`,
			values: [fileId], source: `Содержимое файла ${decodeText(file.filename)}`, database,
		});
		return {
			fileId: Number(file.id), fileName: decodeText(file.filename), packageName: decodeText(file.packagename),
			groupPath: decodeText(file.grouppath ?? ''), objects: buildContentTree(objects.rows),
		};
	});
}

function buildContentTree(rows: FileObjectRow[]): PackageContentNode[] {
	const nodes = new Map<number, PackageContentNode>();
	for (const row of rows) {
		const id = Number(row.id);
		nodes.set(id, {
			id, name: decodeText(row.name) || `Объект ${id}`, classId: Number(row.classid),
			className: decodeText(row.classname ?? ''), parentId: row.seniorid === null ? undefined : Number(row.seniorid),
			kind: objectKind(row), children: [],
		});
	}
	const roots: PackageContentNode[] = [];
	for (const node of nodes.values()) {
		const parent = node.parentId === undefined ? undefined : nodes.get(node.parentId);
		(parent?.children ?? roots).push(node);
	}
	return roots;
}

function objectKind(row: FileObjectRow): DatabaseObjectKind {
	if (row.ismethod) { return 'method'; }
	if (row.isattribute) { return 'attribute'; }
	if (row.isclass) { return 'class'; }
	const value = (row.classname ?? '').toLocaleLowerCase('ru').replace(/\s/g, '');
	if (value.includes('жизненныйцикл')) { return 'lifecycle'; }
	if (value.includes('журнал')) { return 'journal'; }
	if (value.includes('список')) { return 'list'; }
	return 'object';
}

function decodeText(value: string): string {
	const bytea = value.match(/^\\x([\da-f]+)$/i);
	return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : value;
}
async function withDatabase<T>(action: (client: Client, database: string) => Promise<T>): Promise<T> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try { await client.connect(); return await action(client, options.database); }
	finally { await client.end().catch(() => undefined); }
}
