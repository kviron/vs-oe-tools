import { getClientMcpUrl } from '../clientMcpHttp';
import { listManagedClientMcpTools } from '../clientMcpLifecycle';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('list_client_mcp_tools', {
		description: 'List tools exposed by the East Express client HTTP MCP server. The client MCP is started on demand and stopped after an idle timeout. Use this before call_client_mcp_tool because the client catalog changes dynamically.',
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
