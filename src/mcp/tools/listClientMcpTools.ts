import { listClientMcpTools, getClientMcpUrl } from '../clientMcpHttp';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('list_client_mcp_tools', {
		description: 'List tools currently exposed by the running East Express client HTTP MCP server. Use this before call_client_mcp_tool because the client catalog changes dynamically.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => {
		try {
			const tools = await listClientMcpTools();
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
