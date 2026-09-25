import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabase } from '../../database';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_class_details', {
		description: 'Read the full database card for an East Express class by its ID.',
		inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
		annotations: { readOnlyHint: true },
	}, async ({ classId }: { classId: number }) => databaseToolResult(async () => {
		const rows = await queryDatabase(
			`SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
		   FROM classes AS class
		   LEFT JOIN classes AS child ON child.id = class.childclassid
		   LEFT JOIN classes AS parent ON parent.id = class.parentclassid
		  WHERE class.id = $1`,
			[classId],
		);
		return { found: rows.length === 1, class: rows[0] ?? null };
	}));
}
