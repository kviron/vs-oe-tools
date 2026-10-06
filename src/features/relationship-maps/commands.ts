import { z } from 'zod';
import { defineCommand } from '../ai/command';

export const commands = {
	relationship_map: defineCommand(
		z.object({
			mapRequest: z.custom<object>(
				(value) => Boolean(value) && typeof value === 'object',
				'mapRequest is required.',
			),
		}),
		async (input, actions) => {
			if (!actions.relationshipMap) {
				throw new Error('Relationship maps are unavailable.');
			}
			return actions.relationshipMap(input.mapRequest);
		},
	),
};
