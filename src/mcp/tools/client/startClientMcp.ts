import { startManagedClientMcp } from '../../client/lifecycle';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('start_client_mcp', {
		description: 'Start the East Express client HTTP MCP server for the active database and wait until it is ready. Call this before list_client_mcp_tools.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async () => {
		try {
			const result = await startManagedClientMcp();
			return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
		} catch (error) {
			return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
