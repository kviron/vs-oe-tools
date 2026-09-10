import { z } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabase } from '../databaseSession';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('search_methods', {
		description: 'Find East Express methods by name or numeric ID, optionally within one class. Returns method IDs that can be opened by the VS Code navigation tool.',
		inputSchema: {
			query: z.string().min(1).describe('Full or partial method name, or method ID'),
			classId: z.number().int().positive().optional().describe('Optional owning class ID'),
			limit: z.number().int().min(1).max(50).optional().describe('Maximum matches to return, default 20'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, classId, limit }: { query: string; classId?: number; limit?: number }) => databaseToolResult(async () => {
		const rows = await queryDatabase(
			`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname
		   FROM methods AS method
		   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		  WHERE (method.id::text = $1 OR method.name ILIKE $2)
		    AND ($3::bigint IS NULL OR method.seniorid = $3)
		  ORDER BY CASE WHEN lower(method.name) = lower($1) THEN 0 ELSE 1 END,
		           method.name,
		           method.id
		  LIMIT $4`,
			[query.trim(), `%${query.trim()}%`, classId ?? null, limit ?? 20],
		);
		return { query, classId: classId ?? null, count: rows.length, methods: rows };
	}));
}
