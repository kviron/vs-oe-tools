import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_database', {
		description: 'Update the main or test East Express database using the command from DBUpdate_main.bat or DBUpdate_test.bat in the open workspace. VS Code asks the user for confirmation, then runs the command in a visible terminal.',
		inputSchema: {
			role: z.enum(['main', 'test']).describe('Database role to update'),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async ({ role }: { role: 'main' | 'test' }) => bridgeToolResult({ action: 'update_database', role }));
}
