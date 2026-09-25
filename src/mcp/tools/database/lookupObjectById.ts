import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type DatabaseObjectSearchRow, databaseObjectSearchSelect, mapDatabaseObject } from '../../../core/objectSearch';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('lookup_object_by_id', {
		description: 'Identify any East Express object by an otherwise unknown numeric ID. Returns its concrete kind, meta-class, owner and package context.',
		inputSchema: { id: z.number().int().positive().describe('Unknown East Express object ID') },
		annotations: { readOnlyHint: true },
	}, async ({ id }: { id: number }) => databaseToolResult(async () => {
		const rows = await queryDatabaseRaw<DatabaseObjectSearchRow>(`${databaseObjectSearchSelect} WHERE object.id = $1`, [id]);
		return { found: rows.length === 1, object: rows[0] ? mapDatabaseObject(rows[0]) : null };
	}));
}
