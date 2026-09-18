import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('start_client', {
		description: 'Launch bin/fme.exe directly for the main or test database using Vars.bat connection names and the client credentials saved in VS Code settings.',
		inputSchema: {
			role: z.enum(['main', 'test']).describe('Database role whose client should be launched'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ role }: { role: 'main' | 'test' }) => bridgeToolResult({ action: 'start_client', role }));
}
