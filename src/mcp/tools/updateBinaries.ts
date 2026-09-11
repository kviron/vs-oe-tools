import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_binaries', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Run BinUpdate.bat from the root of the open East Express workspace. VS Code asks the user for confirmation, then runs the batch file in a visible terminal.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async () => bridgeToolResult({ action: 'update_binaries' }));
}
