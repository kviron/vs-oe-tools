import { z } from 'zod';
import { defineCommand, nativeConnection, nonempty, positiveId } from '../ai/command';
import { createLifecycleParameterMethodId } from './lifecycleMethodExecution';

export const commands = {
	execute_lifecycle_method: defineCommand(
		z.object({
			id: positiveId().superRefine((id, ctx) => {
				if (id !== createLifecycleParameterMethodId) {
					ctx.addIssue({
						code: 'custom',
						message: 'Method ' + id + ' is not allowlisted for execute_lifecycle_method.',
					});
				}
			}),
			methodParameter: nonempty('methodParameter is required for execute_lifecycle_method.'),
			...nativeConnection('execute_lifecycle_method'),
		}),
		async (input, actions) =>
			actions.executeLifecycleMethod(input.id, input.methodParameter, input.database, input.host),
	),
	start_client_mcp: defineCommand(z.object(nativeConnection('start_client_mcp')), async (input, actions) =>
		actions.startClientMcp(input.database, input.host),
	),
};
