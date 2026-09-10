import { z } from '../schemas';
import { queryDatabaseRaw } from '../databaseSession';
import { navigationToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('reveal_method_in_class', {
		description: 'Open the owning class card in the vc-ve-tools Explorer, switch to its Methods tab, select the exact method row, and scroll it into view without mouse or cursor automation.',
		inputSchema: { methodId: z.number().int().positive().describe('Method ID returned by search_methods') },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ methodId }: { methodId: number }) => {
		const rows = await queryDatabaseRaw<{ classid: number }>('SELECT seniorid AS classid FROM methods WHERE id = $1', [methodId]);
		const classId = rows[0]?.classid;
		if (!classId) {
			return { content: [{ type: 'text' as const, text: `Method ${methodId} was not found.` }], isError: true };
		}
		return navigationToolResult('reveal_method', methodId, classId);
	});
}
