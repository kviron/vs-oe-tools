import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { loadClassPropertyRows, toMcpClassProperty } from '../../queries/propertyQueries';
import { selectVisibleProperties } from '../../queries/classProperties';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_class_properties', {
		description: 'Read script properties declared by an East Express class, optionally including inherited definitions. Returns owner, aliases, read-only state, visibility, package and stable property IDs.',
		inputSchema: {
			classId: z.number().int().positive().describe('Class ID returned by search_classes'),
			includeInherited: z.boolean().optional().describe('Include properties from ancestor classes, default true'),
			includeShadowed: z.boolean().optional().describe('Include overridden ancestor definitions, default false'),
			query: z.string().optional().describe('Optional case-insensitive filter by property name, alias, ID, owner, visibility or package'),
			limit: z.number().int().min(1).max(500).optional().describe('Maximum properties to return, default 200'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ classId, includeInherited, includeShadowed, query, limit }: {
		classId: number;
		includeInherited?: boolean;
		includeShadowed?: boolean;
		query?: string;
		limit?: number;
	}) => databaseToolResult(async () => {
		const classRows = await queryDatabaseRaw<{ id: number | string; name: string } & Record<string, unknown>>('SELECT id, name FROM classes WHERE id = $1', [classId]);
		const selectedClass = classRows[0];
		if (!selectedClass) {
			throw new Error(`Class ${classId} was not found.`);
		}
		let properties = (await loadClassPropertyRows(classId, includeInherited !== false)).map(toMcpClassProperty);
		properties = selectVisibleProperties(properties, includeShadowed === true);
		const normalizedQuery = query?.trim().toLocaleLowerCase('ru');
		if (normalizedQuery) {
			properties = properties.filter(property => [property.id, property.name, property.aliases, property.ownerClassName, property.visibility, property.package]
				.some(value => value.toLocaleLowerCase('ru').includes(normalizedQuery)));
		}
		properties.sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.depth - right.depth);
		const maximum = limit ?? 200;
		return {
			classId: String(selectedClass.id), className: selectedClass.name,
			includeInherited: includeInherited !== false, includeShadowed: includeShadowed === true,
			source: 'Properties', binaryPropertiesIncluded: false,
			totalCount: properties.length, count: Math.min(properties.length, maximum), truncated: properties.length > maximum,
			properties: properties.slice(0, maximum),
		};
	}));
}
