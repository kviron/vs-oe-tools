import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('stop_http_test_server', {
		description: 'Stop the REST test server process started by start_http_test_server. Call this in cleanup even when an HTTP request fails.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async () => bridgeToolResult({ action: 'stop_http_test_server' }));
}
