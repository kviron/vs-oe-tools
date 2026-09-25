import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_method_compilation_history', {
		description: 'Read saved method compiler results, newest first. Optionally filter by method ID.',
		inputSchema: {
			methodId: z.number().int().positive().optional(),
			limit: z.number().int().min(1).max(100).optional(),
		},
		annotations: { readOnlyHint: true },
	}, async ({ methodId, limit }: { methodId?: number; limit?: number }) =>
		bridgeToolResult({ action: 'get_method_compilation_history', id: methodId, limit: limit ?? 50 }));
}
