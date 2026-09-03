import * as path from 'node:path';
import { hostname } from 'node:os';
import * as vscode from 'vscode';
import { Client } from 'pg';
import type { PackageSyncItem } from '../../features/package-sync/models';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { executeMonitoredQuery } from './databaseQueryExecutor';

interface PackageSyncRow {
	objectid: number;
	objectclassid: number;
	objectseniorid: number | null;
	objectname: string | null;
	objectcontentmd5: string | null;
	objectcontentrevision: number | null;
	objectchangestate: string | number | null;
	objectchangelastdate: Date | string | null;
	objectchangelastuser: string | number | null;
	objectpath: string | null;
	packagepath: string | null;
	physicalfilename: string | null;
}

export async function loadPackageSyncItems(): Promise<PackageSyncItem[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const [itemsResult, tuneResult] = await Promise.all([
			executeMonitoredQuery<PackageSyncRow>(client, {
				text: `SELECT
				 ObjectID AS objectid,
				 ObjectClassID AS objectclassid,
				 ObjectSeniorID AS objectseniorid,
				 ObjectName AS objectname,
				 ObjectContentMD5 AS objectcontentmd5,
				 ObjectContentRevision AS objectcontentrevision,
				 ObjectChangeState AS objectchangestate,
				 ObjectChangeLastDate AS objectchangelastdate,
				 ObjectChangeLastUser AS objectchangelastuser,
				 SPB.ObjectPath AS objectpath,
				 COALESCE(SP.PackageName, CAST(SPB.ObjectPathPackage AS text)) AS packagepath,
				 SF.FileName AS physicalfilename
				 FROM SysPackageBase SPB
				 LEFT JOIN SysPackages SP ON SP.ID = SPB.ObjectPathPackage
				 LEFT JOIN SysFile SF ON SF.ID = SPB.ObjectID
				 ORDER BY packagepath, SPB.ObjectPath, SPB.ObjectName`,
				source: 'Синхронизация пакетов: загрузка объектов',
				database: options.database,
			}),
			executeMonitoredQuery<{ pathtopackages: string }>(client, {
				text: `SELECT pathtopackages FROM packagestune
				 WHERE upper(computername) = upper($1)
				   AND NULLIF(trim(pathtopackages), '') IS NOT NULL
				 LIMIT 1`,
				values: [hostname()],
				source: 'Синхронизация пакетов: путь к пакетам',
				database: options.database,
			}).catch(() => undefined),
		]);
		const packagesRoot = tuneResult?.rows[0]?.pathtopackages ?? workspacePackagesRoot();
		return itemsResult.rows.map(row => {
			const objectPath = row.objectpath ?? '';
			const packagePath = row.packagepath ?? '';
			return {
				objectId: Number(row.objectid),
				objectClassId: Number(row.objectclassid),
				objectSeniorId: row.objectseniorid === null ? null : Number(row.objectseniorid),
				objectName: row.objectname ?? '',
				contentMd5: row.objectcontentmd5 ?? '',
				contentRevision: row.objectcontentrevision === null ? null : Number(row.objectcontentrevision),
				changeState: row.objectchangestate === null ? '' : String(row.objectchangestate),
				changedAt: row.objectchangelastdate instanceof Date ? row.objectchangelastdate.toISOString() : String(row.objectchangelastdate ?? ''),
				changedBy: row.objectchangelastuser === null ? '' : String(row.objectchangelastuser),
				objectPath,
				packagePath,
				localPath: packagesRoot ? resolveLocalPath(packagesRoot, packagePath, objectPath, row.physicalfilename ?? row.objectname ?? '') : undefined,
			};
		});
	} finally {
		await client.end().catch(() => undefined);
	}
}

function resolveLocalPath(root: string, packagePath: string, objectPath: string, name: string): string {
	if (/^[a-z]:[\\/]/i.test(objectPath) || /^\\\\/.test(objectPath)) {return path.normalize(objectPath);}
	const cleanPackage = packagePath.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');
	const cleanObject = objectPath.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');
	const cleanName = name.replace(/\//g, '\\').replace(/^\\+/, '');
	const normalizedName = cleanName.toLocaleLowerCase('en-US');
	const normalizedPackage = cleanPackage.toLocaleLowerCase('en-US');
	const extension = path.extname(cleanName);
	const nameWithoutExtension = extension ? cleanName.slice(0, -extension.length) : cleanName;
	if (extension && cleanObject.toLocaleLowerCase('en-US').endsWith(nameWithoutExtension.toLocaleLowerCase('en-US'))) {
		const qualifiedObject = cleanObject.toLocaleLowerCase('en-US').startsWith(`${normalizedPackage}\\`)
			? cleanObject
			: [cleanPackage, cleanObject].filter(Boolean).join('\\');
		return path.join(root, `${qualifiedObject}${extension}`);
	}
	if (cleanName.includes('\\')) {
		const qualifiedName = normalizedName.startsWith(`${normalizedPackage}\\`)
			? cleanName
			: [cleanPackage, cleanName].filter(Boolean).join('\\');
		return path.join(root, qualifiedName);
	}
	const objectHasName = cleanObject.toLocaleLowerCase('en-US').endsWith(normalizedName);
	const objectHasPackage = cleanObject.toLocaleLowerCase('en-US').startsWith(`${cleanPackage.toLocaleLowerCase('en-US')}\\`);
	const nameIsPackage = normalizedName === normalizedPackage;
	const relative = [objectHasPackage ? '' : cleanPackage, cleanObject, objectHasName || nameIsPackage ? '' : cleanName].filter(Boolean).join('\\');
	return path.join(root, relative);
}

function workspacePackagesRoot(): string | undefined {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceRoot) {return undefined;}
	return path.basename(workspaceRoot).toLocaleLowerCase('en-US') === 'packages'
		? workspaceRoot
		: path.join(workspaceRoot, 'packages');
}
