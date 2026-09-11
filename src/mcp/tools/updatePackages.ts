import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_packages', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Run svn update in the packages folder of the open East Express workspace. VS Code asks the user for confirmation, then runs the command in a visible terminal.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	}, async () => bridgeToolResult({ action: 'update_packages' }));
}
