import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_task', {
		description: 'Find production tasks across WorkDoc by exact stable ID, exact task number, or partial title. Returns every field from the complete task card, including description, people, project, priority, releases, revisions, attachment count, and current state comment.',
		inputSchema: {
			query: z.string().trim().min(1).max(500).describe('Stable task ID, task number, or partial task title'),
			limit: z.number().int().min(1).max(25).optional().describe('Maximum title matches, default 10'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query: string; limit?: number }) => bridgeToolResult({
		action: 'get_production_task', query, limit: limit ?? 10,
	}));
}
