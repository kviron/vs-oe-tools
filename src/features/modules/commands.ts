import { z } from 'zod';
import { defineCommand, expectedConnection, positiveId, text } from '../ai/command';

export const commands = {
	update_module_source: defineCommand(
		z.object({
			id: positiveId(),
			code: text('Code must be a string for update_module_source.'),
			...expectedConnection('update_module_source'),
		}),
		async (input, actions) =>
			actions.updateModuleSource(
				input.id,
				input.code,
				input.expectedDatabase,
				input.expectedHost,
				input.expectedPort,
			),
	),
};
