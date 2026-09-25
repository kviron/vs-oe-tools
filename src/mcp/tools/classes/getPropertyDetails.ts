import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type PropertyDetailsRow, toMcpClassProperty, propertyValue, isEmptyWriteMember } from '../../queries/propertyQueries';
import { normalizeAttributeRecord } from '../../queries/attributeQueries';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_property_details', {
		description: 'Read the complete stored Properties record for one East Express script property. Binary RTTI-only properties are not stored in this table.',
		inputSchema: { propertyId: z.number().int().positive().describe('Property ID returned by get_class_properties') },
		annotations: { readOnlyHint: true },
	}, async ({ propertyId }: { propertyId: number }) => databaseToolResult(async () => {
		const rows = await queryDatabaseRaw<PropertyDetailsRow>(
			`SELECT to_jsonb(property) AS data, owner.id AS ownerclassid, owner.name AS ownerclassname,
		        visibility.name AS propvisibility, package.packagename AS proppackage
		 FROM properties AS property
		 LEFT JOIN abstract AS owner ON owner.id = property.seniorid
		 LEFT JOIN enum AS visibility ON visibility.classid = 12450282
		   AND ((visibility.id = 12450286 AND (NULLIF(property.visibility, 0) IS NULL OR property.visibility = 12450283))
		     OR (property.visibility <> 12450283 AND visibility.id = property.visibility))
		 LEFT JOIN abstract AS abstract_property ON abstract_property.id = property.id
		 LEFT JOIN sysfile AS file ON file.id = abstract_property.sysfile
		 LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		 LEFT JOIN syspackages AS package ON package.id = file_group.package
		 WHERE property.id = $1`,
			[propertyId],
		);
		const row = rows[0];
		if (!row) {
			throw new Error(`Property ${propertyId} was not found.`);
		}
		return {
			found: true,
			property: {
				...toMcpClassProperty({
					id: propertyId, propname: propertyValue(row.data, 'name'), propaliases: propertyValue(row.data, 'aliases'),
					ownerclassid: row.ownerclassid, ownerclassname: row.ownerclassname,
					proponlyread: isEmptyWriteMember(propertyValue(row.data, 'writemember')) ? 'Да' : null,
					propvisibility: row.propvisibility, proppackage: row.proppackage, depth: 0,
				}),
				data: normalizeAttributeRecord(row.data),
			},
		};
	}));
}
