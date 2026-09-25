import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_binaries', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Update client and server binaries directly with OEUpdater. VS Code shows the selected build for confirmation, then reports stages and logs.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async () => bridgeToolResult({ action: 'update_binaries' }));
}
