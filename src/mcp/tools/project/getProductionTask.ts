import { commands as featureCommands } from '../../../features/production-tasks/commands';
import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_task', {
		description: 'Find production tasks by ID, number or text using the source selected in the extension. OENP returns complete cards and recent history. Public MCP searches number, title and content and returns basic fields plus full task text; other fields and history are unavailable, as indicated in the response.',
		inputSchema: {
			query: featureCommands.get_production_task.schema.shape.query.pipe(z.string().trim().min(1).max(500)).describe('Stable task ID, task number, or partial task title'),
			limit: featureCommands.get_production_task.schema.shape.limit.optional().describe('Maximum title matches, default 10'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query: string; limit?: number }) => bridgeToolResult({
		action: 'get_production_task', query, limit: limit ?? 10,
	}));
}
