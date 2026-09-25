import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { loadClassDictionaryStorage, dictionaryResult } from '../../queries/dictionaryQueries';
import { quotePostgresIdentifier } from '../../queries/classAttributes';
import { queryDatabaseRaw } from '../../database';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('search_class_dictionary', {
		description: 'Find dictionary elements inside one East Express class by ID, name or any stored class attribute. Optionally restrict the search to one logical attribute name, attribute ID or database field.',
		inputSchema: {
			classId: z.number().int().positive().describe('Non-virtual class ID returned by search_classes'),
			query: z.string().min(1).describe('Element ID, name or attribute value to find'),
			attribute: z.string().min(1).optional().describe('Optional logical attribute name, attribute ID or physical database field'),
			limit: z.number().int().min(1).max(100).optional().describe('Maximum matches, default and maximum 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ classId, query, attribute, limit }: { classId: number; query: string; attribute?: string; limit?: number }) => databaseToolResult(async () => {
		const storage = await loadClassDictionaryStorage(classId);
		const term = query.trim();
		const normalizedAttribute = attribute?.trim().toLocaleLowerCase('ru');
		const searchable = normalizedAttribute
			? storage.columns.filter(column => [column.attributeId, column.attributeName, column.key].some(value => value.toLocaleLowerCase('ru') === normalizedAttribute))
			: storage.columns;
		if (searchable.length === 0) {
			throw new Error(`Attribute ${attribute} was not found in class ${storage.className}.`);
		}
		const predicates: string[] = [];
		const values: unknown[] = [];
		if (storage.classIdColumn) {
			values.push(storage.classIds);
			predicates.push(`${quotePostgresIdentifier(storage.classIdColumn)} = ANY($${values.length}::bigint[])`);
		}
		values.push(`%${term}%`);
		const patternParameter = `$${values.length}`;
		const valuePredicates = searchable.map(column => `${quotePostgresIdentifier(column.key)}::text ILIKE ${patternParameter}`);
		if (/^\d+$/.test(term) && storage.idColumn && searchable.some(column => column.key.toLowerCase() === storage.idColumn?.toLowerCase())) {
			values.push(term);
			valuePredicates.unshift(`${quotePostgresIdentifier(storage.idColumn)}::text = $${values.length}`);
		}
		predicates.push(`(${valuePredicates.join(' OR ')})`);
		const maximum = limit ?? 100;
		values.push(maximum);
		const rows = await queryDatabaseRaw<Record<string, unknown>>(
			`SELECT * FROM ${storage.source} WHERE ${predicates.join(' AND ')}
		 ORDER BY ${quotePostgresIdentifier(storage.idColumn ?? storage.physicalColumns[0])} LIMIT $${values.length}`,
			values,
		);
		return { ...dictionaryResult(storage, rows, 0, maximum, rows.length), query: term, attribute: attribute ?? null, matchCount: rows.length };
	}));
}
