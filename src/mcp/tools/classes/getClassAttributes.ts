import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type AttributeTableRow, attributeTableDiscoveryQuery, type ClassAttributeSourceRow, createClassAttributesQuery, toMcpClassAttribute } from '../../queries/attributeQueries';
import { quotePostgresIdentifier, selectVisibleAttributes } from '../../queries/classAttributes';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_class_attributes', {
		description: 'Read East Express class attributes for code analysis, including logical type, physical database field, owner and inheritance depth.',
		inputSchema: {
			classId: z.number().int().positive().describe('Class ID returned by search_classes'),
			includeInherited: z.boolean().optional().describe('Include inherited attributes, default true'),
			includeShadowed: z.boolean().optional().describe('Include overridden ancestor definitions, default false'),
			query: z.string().optional().describe('Optional case-insensitive filter by attribute name, ID, type or physical database field'),
			limit: z.number().int().min(1).max(500).optional().describe('Maximum attributes to return, default 200'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ classId, includeInherited, includeShadowed, query, limit }: {
		classId: number;
		includeInherited?: boolean;
		includeShadowed?: boolean;
		query?: string;
		limit?: number;
	}) => databaseToolResult(async () => {
		const classRows = await queryDatabaseRaw<{ id: number | string; name: string } & Record<string, unknown>>(
			'SELECT id, name FROM classes WHERE id = $1',
			[classId],
		);
		const selectedClass = classRows[0];
		if (!selectedClass) {
			throw new Error(`Class ${classId} was not found.`);
		}
		const tableRows = await queryDatabaseRaw<AttributeTableRow>(attributeTableDiscoveryQuery, []);
		const table = tableRows[0];
		if (!table) {
			throw new Error('A class attribute table was not found in the database schema.');
		}
		const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
		if (!ownerColumn) {
			throw new Error('The class attribute table does not contain an owner column.');
		}
		const orderColumn = ['ord', 'line', 'linenumber', 'name'].find(column => table.columns.includes(column)) ?? 'id';
		const tableName = `${quotePostgresIdentifier(table.table_schema)}.${quotePostgresIdentifier(table.table_name)}`;
		const rows = await queryDatabaseRaw<ClassAttributeSourceRow>(
			createClassAttributesQuery(tableName, ownerColumn, orderColumn, includeInherited !== false),
			[classId],
		);
		let attributes = rows.map(row => toMcpClassAttribute(row));
		attributes = selectVisibleAttributes(attributes, includeShadowed === true);
		const normalizedQuery = query?.trim().toLocaleLowerCase('ru');
		if (normalizedQuery) {
			attributes = attributes.filter(attribute => [attribute.id, attribute.name, attribute.type, attribute.dbFieldName, attribute.ownerClassName]
				.some(value => value.toLocaleLowerCase('ru').includes(normalizedQuery)));
		}
		attributes.sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.depth - right.depth);
		const maximum = limit ?? 200;
		return {
			classId: String(selectedClass.id),
			className: selectedClass.name,
			includeInherited: includeInherited !== false,
			includeShadowed: includeShadowed === true,
			table: `${table.table_schema}.${table.table_name}`,
			totalCount: attributes.length,
			count: Math.min(attributes.length, maximum),
			truncated: attributes.length > maximum,
			attributes: attributes.slice(0, maximum),
		};
	}));
}
