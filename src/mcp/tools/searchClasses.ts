import { z } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabase } from '../databaseSession';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('search_classes', {
		description: 'Find East Express classes by name, title, alias, or numeric ID. Returns stable class IDs that can be passed to VS Code navigation tools.',
		inputSchema: {
			query: z.string().min(1).describe('Full or partial class name, title, alias, or class ID'),
			limit: z.number().int().min(1).max(50).optional().describe('Maximum matches to return, default 20'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query: string; limit?: number }) => databaseToolResult(async () => {
		const rows = await queryDatabase(
			`SELECT class.id, class.name, class.title, class.aliases, class.seniorid
		   FROM classes AS class
		  WHERE class.id::text = $1
		     OR class.name ILIKE $2
		     OR COALESCE(class.title::text, '') ILIKE $2
		     OR COALESCE(class.aliases::text, '') ILIKE $2
		  ORDER BY CASE WHEN lower(class.name) = lower($1) THEN 0 ELSE 1 END,
		           class.name
		  LIMIT $3`,
			[query.trim(), `%${query.trim()}%`, limit ?? 20],
		);
		return { query, count: rows.length, classes: rows };
	}));
}
