import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type AttributeTableRow, attributeTableDiscoveryQuery, type ClassAttributeSourceRow, toMcpClassAttribute } from '../../queries/attributeQueries';
import { quotePostgresIdentifier } from '../../queries/classAttributes';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_attribute_details', {
		description: 'Read the complete database record of one East Express class attribute by ID, including its owner, logical type and physical database field.',
		inputSchema: {
			attributeId: z.number().int().positive().describe('Attribute ID returned by get_class_attributes'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ attributeId }: { attributeId: number }) => databaseToolResult(async () => {
		const tableRows = await queryDatabaseRaw<AttributeTableRow>(attributeTableDiscoveryQuery, []);
		const table = tableRows[0];
		if (!table) {
			throw new Error('A class attribute table was not found in the database schema.');
		}
		const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
		if (!ownerColumn) {
			throw new Error('The class attribute table does not contain an owner column.');
		}
		const tableName = `${quotePostgresIdentifier(table.table_schema)}.${quotePostgresIdentifier(table.table_name)}`;
		const typeJoin = table.columns.includes('attrtype') ? 'LEFT JOIN classes AS attribute_type ON attribute_type.id = attribute.attrtype' : '';
		const typeColumn = table.columns.includes('attrtype') ? ', attribute_type.name AS attributetypename' : ", ''::text AS attributetypename";
		const rows = await queryDatabaseRaw<ClassAttributeSourceRow & { attributetypename: string }>(
			`SELECT to_jsonb(attribute) AS data, owner.id AS ownerclassid, owner.name AS ownerclassname, 0 AS depth${typeColumn}
		 FROM ${tableName} AS attribute
		 LEFT JOIN classes AS owner ON owner.id = attribute.${quotePostgresIdentifier(ownerColumn)}
		 ${typeJoin}
		 WHERE attribute.id = $1`,
			[attributeId],
		);
		const row = rows[0];
		if (!row) {
			throw new Error(`Attribute ${attributeId} was not found.`);
		}
		return {
			found: true,
			table: `${table.table_schema}.${table.table_name}`,
			attribute: { ...toMcpClassAttribute(row), attributeTypeName: row.attributetypename },
		};
	}));
}
