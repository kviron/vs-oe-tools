import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_tasks_in_progress', {
		description: 'Load full current-employee task cards in status В работе when OENP is selected. Public MCP does not expose status and returns an explicit unsupported-feature error.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => bridgeToolResult({ action: 'get_production_tasks_in_progress' }));
}
