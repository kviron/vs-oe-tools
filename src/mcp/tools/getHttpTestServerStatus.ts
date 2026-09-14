import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_http_test_server_status', {
		description: 'Return whether the East Express REST test server is running, including its database, selected method, URL, and process ID.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => bridgeToolResult({ action: 'get_http_test_server_status' }));
}
