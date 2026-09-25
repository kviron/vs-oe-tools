import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import { loadActiveDatabaseOptions } from '../../database';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('compile_method', {
		description: 'Check an East Express method with the native compiler after creating or changing it. Returns errors and warnings with line numbers and saves the result in compilation history. Verify get_active_database first.',
		inputSchema: {
			methodId: z.number().int().positive().describe('Method ID to check'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ methodId }: { methodId: number }) => {
		const options = await loadActiveDatabaseOptions();
		const response = await bridgeToolResult({ action: 'compile_method', id: methodId,
			expectedDatabase: options.database, expectedHost: options.host, expectedPort: options.port });
		const passed = (response.structuredContent as { result?: { passed?: boolean } } | undefined)?.result?.passed;
		return passed === false ? { ...response, isError: true } : response;
	});
}
