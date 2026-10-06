import { z } from 'zod';
import { defineCommand, expectedConnection, integer, positiveId, text } from '../ai/command';

export const commands = {
	bind_objects_to_package: defineCommand(
		z
			.object({
				objectIds: z
					.array(positiveId(), {
						required_error:
							'objectIds must contain 1 to 100 positive integers for bind_objects_to_package.',
					})
					.min(1, 'objectIds must contain 1 to 100 positive integers for bind_objects_to_package.')
					.max(100),
				templateObjectId: positiveId().optional(),
				sysFileId: positiveId().optional(),
				...expectedConnection('bind_objects_to_package'),
			})
			.refine(
				(input) => (input.templateObjectId === undefined) !== (input.sysFileId === undefined),
				'Exactly one of templateObjectId or sysFileId is required for bind_objects_to_package.',
			),
		async (input, actions) =>
			actions.bindObjectsToPackage({
				objectIds: input.objectIds,
				templateObjectId: input.templateObjectId,
				sysFileId: input.sysFileId,
				expectedDatabase: input.expectedDatabase,
				expectedHost: input.expectedHost,
				expectedPort: input.expectedPort,
			}),
	),
	get_package_sync_changes: defineCommand(
		z.object({
			query: text('Package synchronization query must be a string.').optional(),
			offset: integer(
				0,
				Number.MAX_SAFE_INTEGER,
				'Package synchronization offset must be a non-negative integer.',
			),
			limit: integer(1, 500, 'Package synchronization limit must be an integer from 1 to 500.'),
		}),
		async (input, actions) => actions.getPackageSyncChanges(input.query, input.offset, input.limit),
	),
};
