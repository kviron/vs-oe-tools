import { commands as featureCommands } from '../../../features/production-tasks/commands';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_tasks', {
		description: 'Load production tasks using the source selected in the extension. Public MCP returns a bounded general list; an optional query searches by number, ID, title or content. Pass folder_uri only when the user supplied its complete value in the prompt; never infer or construct it. The selected folder can provide filters such as executor or state.',
		inputSchema: {
			query: featureCommands.get_production_tasks.schema.shape.query.describe('Optional partial task ID, number, or title'),
			limit: featureCommands.get_production_tasks.schema.shape.limit.optional().describe('Maximum tasks, default 100'),
			folder_uri: featureCommands.get_production_tasks.schema.shape.folder_uri.describe('Complete selection-folder URI. Use only when the user explicitly supplied this exact value in the prompt; never choose or construct one.'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit, folder_uri }: { query?: string; limit?: number; folder_uri?: string }) => bridgeToolResult({
		action: 'get_production_tasks', query, limit: limit ?? 100, folder_uri,
	}));
}
