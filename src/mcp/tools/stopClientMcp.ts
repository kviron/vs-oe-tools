import { stopManagedClientMcp } from '../clientMcpLifecycle';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('stop_client_mcp', {
		description: 'Stop the East Express client HTTP MCP server after client tool work is complete, including cleanup after errors.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async () => {
		try {
			const result = await stopManagedClientMcp();
			return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
		} catch (error) {
			return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
