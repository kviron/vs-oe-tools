import { z } from 'zod';
import { defineCommand, integer, nonempty, text } from '../ai/command';

export const commands = {
	get_production_tasks: defineCommand(
		z.object({
			query: text('Production tasks query must be a string.').optional(),
			limit: integer(1, 250, 'Production tasks limit must be an integer from 1 to 250.'),
		}),
		async (input, actions) => actions.getProductionTasks(input.query, input.limit),
	),
	get_production_task: defineCommand(
		z.object({
			query: nonempty('Production task query must be a non-empty string.'),
			limit: integer(1, 25, 'Production task search limit must be an integer from 1 to 25.'),
		}),
		async (input, actions) => actions.getProductionTask(input.query, input.limit),
	),
	get_production_tasks_in_progress: defineCommand(z.object({}), async (_input, actions) =>
		actions.getProductionTasksInProgress(),
	),
};
