import { z, sourceExcerptSchema } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type DfmSourceRow, dfmInheritanceQuery, formatDfmSource } from '../../queries/dfmQueries';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_dfm_inheritance', {
		description: 'Read decoded DFM sources across the inheritance chain of an East Express class, ordered from ancestor to selected class.',
		inputSchema: {
			classId: z.number().int().positive().describe('Class ID returned by search_classes'),
			...sourceExcerptSchema,
		},
		annotations: { readOnlyHint: true },
	}, async ({ classId, startLine, maxLines }: { classId: number; startLine?: number; maxLines?: number }) => databaseToolResult(async () => {
		const rows = await queryDatabaseRaw<DfmSourceRow & { depth: number }>(dfmInheritanceQuery, [classId]);
		return {
			classId: String(classId),
			count: rows.length,
			sources: rows.map(row => ({ depth: row.depth, ...formatDfmSource(row, startLine, maxLines) })),
		};
	}));
}
