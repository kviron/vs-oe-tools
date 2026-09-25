import { z, sourceExcerptSchema } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type DfmSourceRow, dfmSourceQuery, formatDfmSource } from '../../queries/dfmQueries';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_dfm_source', {
		description: 'Read the decoded Windows-1251 DFM source owned by an East Express class. Returns numbered lines and pagination metadata.',
		inputSchema: {
			classId: z.number().int().positive().describe('Class ID returned by search_classes'),
			...sourceExcerptSchema,
		},
		annotations: { readOnlyHint: true },
	}, async ({ classId, startLine, maxLines }: { classId: number; startLine?: number; maxLines?: number }) => databaseToolResult(async () => {
		const rows = await queryDatabaseRaw<DfmSourceRow>(dfmSourceQuery, [classId]);
		const dfm = rows[0];
		if (!dfm) {
			throw new Error(`Class ${classId} does not have its own DFM source.`);
		}
		return { found: true, ...formatDfmSource(dfm, startLine, maxLines) };
	}));
}
