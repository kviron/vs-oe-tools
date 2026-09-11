import { getClientMcpUrl } from '../clientMcpHttp';
import { callManagedClientMcpTool } from '../clientMcpLifecycle';
import { z } from '../schemas';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('call_client_mcp_tool', {
		description: 'DEPRECATED: this potentially data-changing gateway will be removed soon. Call a tool exposed by the East Express client HTTP MCP server. The client MCP is started on demand and stopped after an idle timeout. Call list_client_mcp_tools first and pass arguments that match its live input schema. Some client tools create or save objects, so invoke mutating tools only when the user explicitly requests that action.',
		inputSchema: {
			name: z.string().min(1).describe('Exact tool name returned by list_client_mcp_tools'),
			arguments: z.record(z.string(), z.unknown()).optional().describe('Arguments matching the tool input schema'),
		},
		annotations: { readOnlyHint: false, destructiveHint: true },
	}, async ({ name, arguments: argumentsValue }: { name: string; arguments?: Record<string, unknown> }) => {
		try {
			const response = await callManagedClientMcpTool(name, argumentsValue);
			return {
				content: response.content,
				structuredContent: {
					clientMcpUrl: getClientMcpUrl(),
					tool: name,
					result: response,
				},
				isError: response.isError,
			};
		} catch (error) {
			return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
		}
	});
}
