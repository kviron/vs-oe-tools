import { bridgeToolResult } from '../../bridge';
import { z } from '../../schemas';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('call_http_test_server', {
		description: 'Send an HTTP request to the running East Express REST test server and return status, headers, duration, and body. Use the method selected when starting the server.',
		inputSchema: {
			httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional().describe('HTTP verb, default GET (native method/query-parameter protocol)'),
			methodName: z.string().min(1).optional().describe('HttpMethods entry to invoke; defaults to the running server method'),
			headers: z.record(z.string(), z.string()).optional().describe('Request headers'),
			body: z.string().max(1_048_576).optional().describe('Raw request body'),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async (input: { httpMethod?: string; methodName?: string; headers?: Record<string, string>; body?: string }) => bridgeToolResult({
		action: 'call_http_test_server', httpMethod: input.httpMethod ?? 'GET',
		methodParameter: input.methodName, headers: input.headers, body: input.body,
	}));
}
