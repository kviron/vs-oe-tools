import { commands as featureCommands } from '../../../features/production-tasks/commands';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_tasks', {
		description: 'Load the current employee production task list through the authenticated OENP session held by the VS Code extension. Returns compact task summaries; optionally filter only that current list.',
		inputSchema: {
			query: featureCommands.get_production_tasks.schema.shape.query.describe('Optional partial task ID, number, or title'),
			limit: featureCommands.get_production_tasks.schema.shape.limit.optional().describe('Maximum tasks, default 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query?: string; limit?: number }) => bridgeToolResult({
		action: 'get_production_tasks', query, limit: limit ?? 100,
	}));
}
