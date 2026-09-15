import { bridgeToolResult } from '../bridge';
import { z } from '../schemas';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('start_http_test_server', {
		description: 'Start the East Express REST test server for one exact HttpMethods entry. Stops and replaces any server previously started by the extension. Always call stop_http_test_server after testing.',
		inputSchema: {
			methodName: z.string().min(1).describe('Exact HttpMethods name; wildcard * is not supported'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ methodName }: { methodName: string }) => bridgeToolResult({
		action: 'start_http_test_server', methodParameter: methodName,
	}));
}
