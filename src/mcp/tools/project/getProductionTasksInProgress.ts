import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_tasks_in_progress', {
		description: 'Load full production task cards for the current employee and return only tasks whose status is В работе.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => bridgeToolResult({ action: 'get_production_tasks_in_progress' }));
}
