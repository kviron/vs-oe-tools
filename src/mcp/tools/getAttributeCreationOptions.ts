import { z } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabaseRaw } from '../databaseSession';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_attribute_creation_options', {
		description: 'Read the owner class and valid AttrTypes, visibility, and distribution choices required by create_class_attribute. This tool is read-only and reports the defaults used by the native client capture.',
		inputSchema: {
			ownerClassId: z.number().int().positive().describe('Class that will own the new attribute'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ ownerClassId }: { ownerClassId: number }) => databaseToolResult(async () => {
		const owners = await queryDatabaseRaw<{ id: number; name: string; sysfile: number | null }>(
			'SELECT class.id,class.name,abstract.sysfile FROM classes AS class JOIN abstract ON abstract.id=class.id WHERE class.id=$1', [ownerClassId]);
		const owner = owners[0];
		if (!owner) { throw new Error(`Class ${ownerClassId} was not found.`); }
		const types = await queryDatabaseRaw<{ id: number; name: string }>('SELECT id,name FROM attrtypes ORDER BY id', []);
		const visibilities = await queryDatabaseRaw<{ id: number; name: string }>(
			'SELECT id,COALESCE(fullname,name) AS name FROM enum WHERE classid=$1 ORDER BY id', [12450282]);
		const distributionModes = await queryDatabaseRaw<{ id: number; name: string }>(
			'SELECT id,COALESCE(fullname,name) AS name FROM enum WHERE classid=$1 ORDER BY id', [12450504]);
		return {
			owner,
			types,
			visibilities,
			distributionModes,
			defaults: { visibilityId: 12450284, distributionModeId: 12450505, isNotNull: false, refIntegrityCheck: false },
			virtualOnly: true,
		};
	}));
}
