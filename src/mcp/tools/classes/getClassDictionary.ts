import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { loadClassDictionaryStorage, dictionaryResult } from '../../queries/dictionaryQueries';
import { quotePostgresIdentifier } from '../../queries/classAttributes';
import { queryDatabaseRaw } from '../../database';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_class_dictionary', {
		description: 'Read one page of objects from an East Express class dictionary. Returns logical attribute metadata, total count and stable pagination fields.',
		inputSchema: {
			classId: z.number().int().positive().describe('Non-virtual class ID returned by search_classes'),
			offset: z.number().int().min(0).optional().describe('Zero-based row offset, default 0'),
			limit: z.number().int().min(1).max(100).optional().describe('Page size, default and maximum 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ classId, offset, limit }: { classId: number; offset?: number; limit?: number }) => databaseToolResult(async () => {
		const storage = await loadClassDictionaryStorage(classId);
		const pageOffset = offset ?? 0;
		const pageLimit = limit ?? 100;
		const values: unknown[] = storage.classIdColumn ? [storage.classIds] : [];
		const where = storage.classIdColumn ? ` WHERE ${quotePostgresIdentifier(storage.classIdColumn)} = ANY($1::bigint[])` : '';
		const countRows = await queryDatabaseRaw<{ count: string } & Record<string, unknown>>(`SELECT COUNT(*)::text AS count FROM ${storage.source}${where}`, values);
		const rows = await queryDatabaseRaw<Record<string, unknown>>(
			`SELECT * FROM ${storage.source}${where} ORDER BY ${quotePostgresIdentifier(storage.idColumn ?? storage.physicalColumns[0])}
		 LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
			[...values, pageLimit, pageOffset],
		);
		const totalCount = Number(countRows[0]?.count ?? rows.length);
		return dictionaryResult(storage, rows, pageOffset, pageLimit, totalCount);
	}));
}
