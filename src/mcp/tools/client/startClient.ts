import { commands as featureCommands } from '../../../features/project/commands';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('start_client', {
		description: 'Launch bin/fme.exe for the main or test database using Vars.bat connection names and the client credentials saved in VS Code settings. Check get_client_status first to avoid duplicate clients, and check again after launch; sending the launch command does not prove login readiness.',
		inputSchema: {
			role: featureCommands.start_client.schema.shape.role.describe('Database role whose client should be launched'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ role }: { role: 'main' | 'test' }) => bridgeToolResult({ action: 'start_client', role }));
}
