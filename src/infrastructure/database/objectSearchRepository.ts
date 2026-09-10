import { databaseObjectSearchSelect, mapDatabaseObject, type DatabaseObjectSearchResult, type DatabaseObjectSearchRow } from '../../core/objectSearch';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { withProjectDatabaseSession } from './projectDatabaseSession';

export async function searchDatabaseObjects(query: string, limit = 100): Promise<DatabaseObjectSearchResult[]> {
	return withProjectDatabaseSession(async ({ client, options }) => {
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
	});
}
