import { z } from 'zod';
import { defineCommand, integer, nonempty } from '../ai/command';

export const commands = {
	get_svn_file_history: defineCommand(
		z.object({
			filePath: nonempty('filePath is required for get_svn_file_history.'),
			limit: integer(1, 500, 'SVN history limit must be an integer from 1 to 500.'),
		}),
		async (input, actions) => actions.getSvnFileHistory(input.filePath, input.limit),
	),
};
