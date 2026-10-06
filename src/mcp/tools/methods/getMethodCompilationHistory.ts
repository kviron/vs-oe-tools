import { commands as featureCommands } from '../../../features/methods/commands';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_method_compilation_history', {
		description: 'Read saved method compiler results, newest first. Optionally filter by method ID.',
		inputSchema: {
			methodId: featureCommands.get_method_compilation_history.schema.shape.id,
			limit: featureCommands.get_method_compilation_history.schema.shape.limit,
		},
		annotations: { readOnlyHint: true },
	}, async ({ methodId, limit }: { methodId?: number; limit?: number }) =>
		bridgeToolResult({ action: 'get_method_compilation_history', id: methodId, limit: limit ?? 50 }));
}
