import { z } from 'zod';
import { defineCommand, nonempty } from './command';

export const commands = {
	confirm_sql_mutation: defineCommand(
		z.object({
			sql: nonempty('SQL and database are required for confirm_sql_mutation.'),
			database: nonempty('SQL and database are required for confirm_sql_mutation.'),
		}),
		async (input, actions) => ({ approved: await actions.confirmSqlMutation(input.sql, input.database) }),
	),
};
