import { z } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabaseRaw } from '../databaseSession';
import { type DatabaseObjectSearchRow, databaseObjectSearchSelect, mapDatabaseObject } from '../../core/objectSearch';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('search_database_objects', {
		description: 'Search East Express objects across Abstract, classes, methods and attributes by exact ID or partial name.',
		inputSchema: {
			query: z.string().min(1).describe('Numeric object ID or full/partial object name'),
			limit: z.number().int().min(1).max(500).optional().describe('Maximum results, default 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query: string; limit?: number }) => databaseToolResult(async () => {
		const trimmed = query.trim();
		const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
		const rows = await queryDatabaseRaw<DatabaseObjectSearchRow>(
			`${databaseObjectSearchSelect}
		 WHERE ($1::bigint IS NOT NULL AND object.id = $1) OR object.name ILIKE $2
		 ORDER BY CASE WHEN object.id = $1 THEN 0 WHEN lower(object.name) = lower($3) THEN 1 ELSE 2 END,
		          object.name, object.id
		 LIMIT $4`,
			[numericId, numericId === null ? `%${trimmed}%` : trimmed, trimmed, limit ?? 100],
		);
		return { query: trimmed, count: rows.length, objects: rows.map(mapDatabaseObject) };
	}));
}
