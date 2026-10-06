import { z } from 'zod';
import { defineCommand, nonempty } from '../ai/command';

export const commands = {
	start_http_test_server: defineCommand(
		z.object({ methodParameter: nonempty('An exact methodName is required for start_http_test_server.') }),
		async (input, actions) => actions.startHttpTestServer(input.methodParameter),
	),
	stop_http_test_server: defineCommand(z.object({}), async (_input, actions) => actions.stopHttpTestServer()),
	get_http_test_server_status: defineCommand(z.object({}), async (_input, actions) =>
		actions.getHttpTestServerStatus(),
	),
	call_http_test_server: defineCommand(
		z.object({
			httpMethod: nonempty('httpMethod is required for call_http_test_server.'),
			methodParameter: z.string().optional(),
			headers: z
				.record(z.string({ invalid_type_error: 'HTTP headers must be an object with string values.' }), {
					invalid_type_error: 'HTTP headers must be an object with string values.',
				})
				.optional(),
			body: z.string({ invalid_type_error: 'HTTP body must be a string.' }).optional(),
		}),
		async (input, actions) =>
			actions.callHttpTestServer({
				method: input.httpMethod,
				methodName: input.methodParameter,
				headers: input.headers,
				body: input.body,
			}),
	),
};
