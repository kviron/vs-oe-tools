import { Client } from 'pg';
import { hostname } from 'node:os';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { executeMonitoredQuery } from './databaseQueryExecutor';

export interface MethodWorkingCopyInfo {
	fileName: string;
	relativePath: string;
	packagesRoot?: string;
}

interface WorkingCopyRow {
	filename: string;
	group_path: string | null;
	package_name: string | null;
}

/** Resolves the physical package file which owns a database method. */
export async function getMethodWorkingCopyInfo(methodId: number): Promise<MethodWorkingCopyInfo> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const result = await executeMonitoredQuery<WorkingCopyRow, [number]>(client, {
			text: `SELECT file.filename, groups.path AS group_path, package.packagename AS package_name
			 FROM abstract AS object
			 JOIN sysfile AS file ON file.id = object.sysfile
			 LEFT JOIN sysgroups AS groups ON groups.id = file.sysgroup
			 LEFT JOIN syspackages AS package ON package.id = groups.package
			 WHERE object.id = $1`,
			values: [methodId],
			source: `Поиск локального SVN-файла метода ${methodId}`,
			database: options.database,
		});
		const row = result.rows[0];
		if (!row?.filename) {
			throw new Error(`Для метода ${methodId} не найден связанный sysfile.`);
		}
		const relativePath = [row.package_name, row.group_path, row.filename].filter(Boolean).join('\\');
		const tune = await executeMonitoredQuery<{ pathtopackages: string }, [string]>(client, {
			text: `SELECT pathtopackages
			 FROM packagestune
			 WHERE upper(computername) = upper($1)
			   AND NULLIF(trim(pathtopackages), '') IS NOT NULL
			 LIMIT 1`,
			values: [hostname()],
			source: `Поиск базы пакетов для компьютера ${hostname()}`,
			database: options.database,
		}).catch(() => undefined);
		return { fileName: row.filename, relativePath, packagesRoot: tune?.rows[0]?.pathtopackages };
	} finally {
		await client.end().catch(() => undefined);
	}
}
