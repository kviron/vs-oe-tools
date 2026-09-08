import * as assert from 'node:assert/strict';
import { buildSqlCompletionSchema, completeAliasColumns } from '../features/sql-executor/sqlCompletionSchema';

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

	test('completes alias columns even when FROM appears after the cursor', async () => {
		const document = 'SELECT creator_log. FROM logcchangedobject AS creator_log';
		const position = document.indexOf('.') + 1;
		const result = completeAliasColumns(document, position, {
			schema: { public: { logcchangedobject: ['objid', 'objclassid', 'changedate'] } },
			defaultSchema: 'public',
		});
		assert.deepEqual(result, {
			from: position,
			table: 'logcchangedobject',
			columns: ['objid', 'objclassid', 'changedate'],
		});
	});
});
