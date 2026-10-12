import { commands as featureCommands } from '../../../features/production-tasks/commands';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_tasks', {
		description: 'Load production tasks using the source selected in the extension. OENP returns the current employee list. Public MCP returns a bounded general list without employee/status fields; an optional query searches the API by number, ID, title or content. Respect the response capability note.',
		inputSchema: {
			query: featureCommands.get_production_tasks.schema.shape.query.describe('Optional partial task ID, number, or title'),
			limit: featureCommands.get_production_tasks.schema.shape.limit.optional().describe('Maximum tasks, default 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query?: string; limit?: number }) => bridgeToolResult({
		action: 'get_production_tasks', query, limit: limit ?? 100,
	}));
}
