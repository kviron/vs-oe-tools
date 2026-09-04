import { Client } from 'pg';
import { databaseObjectSearchSelect, mapDatabaseObject, type DatabaseObjectSearchResult, type DatabaseObjectSearchRow } from '../../core/objectSearch';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { executeMonitoredQuery } from './databaseQueryExecutor';

export async function searchDatabaseObjects(query: string, limit = 100): Promise<DatabaseObjectSearchResult[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const trimmed = query.trim();
		const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
		const result = await executeMonitoredQuery<DatabaseObjectSearchRow, [number | null, string, number]>(client, {
			text: `${databaseObjectSearchSelect}
			 WHERE ($1::bigint IS NOT NULL AND object.id = $1)
			    OR object.name ILIKE $2
			 ORDER BY CASE WHEN object.id = $1 THEN 0 WHEN lower(object.name) = lower($2) THEN 1 ELSE 2 END,
			          object.name, object.id
			 LIMIT $3`,
			values: [numericId, numericId === null ? `%${trimmed}%` : trimmed, Math.min(Math.max(limit, 1), 500)],
			source: `Поиск объектов ${trimmed}`,
			database: options.database,
		});
		return result.rows.map(mapDatabaseObject);
	} finally {
		await client.end().catch(() => undefined);
	}
}
