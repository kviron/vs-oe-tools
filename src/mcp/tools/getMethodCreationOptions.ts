import { z } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabaseRaw } from '../databaseSession';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_method_creation_options', {
		description: 'Read the owner class and valid visibility choices for create_class_method. Returns the defaults captured from the native East Express client.',
		inputSchema: {
			ownerClassId: z.number().int().positive().describe('Class that will own the new method'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ ownerClassId }: { ownerClassId: number }) => databaseToolResult(async () => {
		const owners = await queryDatabaseRaw<{ id: number; name: string; sysfile: number | null }>(
			'SELECT class.id,class.name,abstract.sysfile FROM classes AS class JOIN abstract ON abstract.id=class.id WHERE class.id=$1', [ownerClassId]);
		const owner = owners[0];
		if (!owner) { throw new Error(`Class ${ownerClassId} was not found.`); }
		const visibilities = await queryDatabaseRaw<{ id: number; name: string }>(
			'SELECT id,COALESCE(fullname,name) AS name FROM enum WHERE classid=$1 ORDER BY id', [12450282]);
		return {
			owner,
			visibilities,
			defaults: { visibilityId: 12450286, methodType: 3, methodKind: 0, signature: '', code: 'proc()\r\nbegin\r\n\r\nend;\r\n' },
			interpretedOnly: true,
		};
	}));
}
