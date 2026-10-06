import { z } from 'zod';
import { defineCommand, expectedConnection, integer, positiveId, text } from '../ai/command';

export const commands = {
	open_method: defineCommand(z.object({ id: positiveId() }), async (input, actions) => {
		await actions.openMethod(input.id);
		return { id: input.id };
	}),
	reveal_method: defineCommand(
		z.object({
			id: positiveId(),
			classId: positiveId('Navigation classId must be a positive integer for reveal_method.'),
		}),
		async (input, actions) => {
			await actions.revealMethod(input.classId, input.id);
			return { id: input.id };
		},
	),
	update_method_source: defineCommand(
		z.object({
			id: positiveId(),
			code: text('Code must be a string for update_method_source.'),
			...expectedConnection('update_method_source'),
		}),
		async (input, actions) =>
			actions.updateMethodSource(
				input.id,
				input.code,
				input.expectedDatabase,
				input.expectedHost,
				input.expectedPort,
			),
	),
	compile_method: defineCommand(
		z.object({ id: positiveId(), ...expectedConnection('compile_method') }),
		async (input, actions) => ({
			result: await actions.compileMethod(
				input.id,
				input.expectedDatabase,
				input.expectedHost,
				input.expectedPort,
			),
		}),
	),
	get_method_compilation_history: defineCommand(
		z.object({
			id: positiveId('Invalid method ID or limit for get_method_compilation_history.').optional(),
			limit: integer(1, 100, 'Invalid method ID or limit for get_method_compilation_history.').optional(),
		}),
		async (input, actions) => actions.getMethodCompilationHistory(input.id, input.limit ?? 50),
	),
};
