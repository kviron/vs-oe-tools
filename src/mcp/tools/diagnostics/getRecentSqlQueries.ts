import { readOptionalArgument } from '../../arguments';
import { z } from '../../schemas';
import { readFile } from 'node:fs/promises';
import { classifySqlQuery } from '../../../features/sql-monitor/queryCategory';
import type { McpToolServer } from '../../toolTypes';
import { readMcpRuntimeStateSync } from '../../../core/mcpRuntimeState';

const explicitSqlMonitorHistoryPath = readOptionalArgument('--sql-monitor-history');

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_recent_sql_queries', {
		description: 'Read the last filtered SQL queries captured from the East Express client and vc-ve-tools. Use this to diagnose what the client did without executing another database query.',
		inputSchema: {
			limit: z.number().int().min(1).max(500).optional().describe('Maximum queries to return, default 30'),
			search: z.string().optional().describe('Optional case-insensitive filter over SQL text, source, user, and first table'),
			operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER']).optional(),
			category: z.enum(['application', 'metadata', 'system', 'transaction']).optional()
				.describe('Optional query category: application, metadata, system, or transaction'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ limit, search, operation, category }: { limit?: number; search?: string; operation?: string; category?: string }) => {
		const sqlMonitorHistoryPath = explicitSqlMonitorHistoryPath ?? readMcpRuntimeStateSync()?.sqlMonitorHistoryPath;
		if (!sqlMonitorHistoryPath) {
			return { content: [{ type: 'text' as const, text: 'SQL monitor history path is not configured.' }], isError: true };
		}
		try {
			const records = JSON.parse(await readFile(sqlMonitorHistoryPath, 'utf8')) as Array<Record<string, unknown>>;
			const needle = search?.trim().toLocaleLowerCase('ru');
			const filtered = records
				.filter(record => !operation || record.operation === operation)
				.filter(record => !category || classifySqlQuery({
					text: String(record.text ?? ''),
					firstTable: typeof record.firstTable === 'string' ? record.firstTable : undefined,
				}) === category)
				.filter(record => !needle || [record.text, record.source, record.userName, record.firstTable]
					.some(value => String(value ?? '').toLocaleLowerCase('ru').includes(needle)))
				.slice(-(limit ?? 30))
				.reverse();
			const result = { count: filtered.length, totalStored: records.length, queries: filtered };
			return {
				content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
				structuredContent: result,
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				const result = { count: 0, totalStored: 0, queries: [] };
				return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
			}
			return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
