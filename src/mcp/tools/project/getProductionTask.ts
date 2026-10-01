import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_production_task', {
		description: 'Find production tasks across WorkDoc by exact stable ID, exact task number, or partial title. Returns every field from the complete task card and up to 250 recent history entries for each match, including dated actions, states, people, and comments.',
		inputSchema: {
			query: z.string().trim().min(1).max(500).describe('Stable task ID, task number, or partial task title'),
			limit: z.number().int().min(1).max(25).optional().describe('Maximum title matches, default 10'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, limit }: { query: string; limit?: number }) => bridgeToolResult({
		action: 'get_production_task', query, limit: limit ?? 10,
	}));
}
