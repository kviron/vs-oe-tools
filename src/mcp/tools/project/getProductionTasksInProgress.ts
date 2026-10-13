import { z } from 'zod';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_tasks_in_progress', {
		description: 'Load tasks in status В работе. OENP applies the current-employee status filter. For public MCP, pass folder_uri only when the user supplied its complete value in the prompt; never infer or construct it. The selected folder must encode the requested state.',
		inputSchema: { folder_uri: z.string().max(2048).optional().describe('Complete selection-folder URI explicitly supplied by the user; never choose or construct one.') },
		annotations: { readOnlyHint: true },
	}, async ({ folder_uri }: { folder_uri?: string }) => bridgeToolResult({ action: 'get_production_tasks_in_progress', folder_uri }));
}
