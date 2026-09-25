import { getClientMcpUrl } from '../../client/http';
import { listManagedClientMcpTools } from '../../client/lifecycle';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('list_client_mcp_tools', {
		description: 'List tools exposed by an already running East Express client HTTP MCP server. Call start_client_mcp first and stop_client_mcp after the client work is complete.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => {
		try {
			const tools = await listManagedClientMcpTools();
			const result = { url: getClientMcpUrl(), count: tools.length, tools };
			return {
				content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
				structuredContent: result,
			};
		} catch (error) {
			return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
