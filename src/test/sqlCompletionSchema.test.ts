import * as assert from 'node:assert/strict';
import { buildSqlCompletionSchema } from '../infrastructure/database/sqlCompletionSchema';

suite('SQL completion schema', () => {
	test('groups columns by schema and table and selects public by default', () => {
		assert.deepEqual(buildSqlCompletionSchema([
			{ table_schema: 'audit', table_name: 'events', column_name: 'id' },
			{ table_schema: 'public', table_name: 'users', column_name: 'id' },
			{ table_schema: 'public', table_name: 'users', column_name: 'name' },
			{ table_schema: 'public', table_name: 'roles', column_name: 'id' },
		]), {
			schema: {
				audit: { events: ['id'] },
				public: { users: ['id', 'name'], roles: ['id'] },
			},
			defaultSchema: 'public',
		});
	});
});
