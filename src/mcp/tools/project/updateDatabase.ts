import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_database', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Update the main or test East Express database with OEPrjScript and OEPatch. VS Code shows the resolved target and asks for confirmation, then reports progress and logs.',
		inputSchema: {
			role: z.enum(['main', 'test']).describe('Database role to update'),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async ({ role }: { role: 'main' | 'test' }) => bridgeToolResult({ action: 'update_database', role }));
}
