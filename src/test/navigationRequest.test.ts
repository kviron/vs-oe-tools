import * as assert from 'node:assert/strict';
import { validateRequest } from '../features/ai/navigationRequest';

suite('Navigation request validation', () => {
	test('uses the same connection field rules for lifecycle and client MCP', () => {
		for (const action of ['execute_lifecycle_method', 'start_client_mcp'] as const) {
			const valid = { action, id: 3143815, methodParameter: '{}', database: 'тест_01', host: 'localhost:54008' };
			assert.equal(validateRequest(valid).action, action);
			assert.throws(() => validateRequest({ ...valid, database: 'bad/name' }),
				{ message: `database is invalid for ${action}.` });
			assert.throws(() => validateRequest({ ...valid, host: 'bad/name' }),
				{ message: `host is invalid for ${action}.` });
		}
	});

	test('checks lifecycle method allowlist before connection fields', () => {
		assert.throws(() => validateRequest({
			action: 'execute_lifecycle_method', id: 42, methodParameter: '{}', database: 'bad/name', host: 'localhost',
		}), { message: 'Method 42 is not allowlisted for execute_lifecycle_method.' });
	});

	test('keeps the exact HTTP test method name requirement', () => {
		assert.throws(() => validateRequest({ action: 'start_http_test_server', methodParameter: ' ' }),
			{ message: 'An exact methodName is required for start_http_test_server.' });
	});

	test('requires exact SQL and database for mutation confirmation', () => {
		const request = validateRequest({ action: 'confirm_sql_mutation', sql: 'UPDATE classes SET name = name', database: 'oetrunk' });
		assert.equal(request.action, 'confirm_sql_mutation');
		assert.equal(request.sql, 'UPDATE classes SET name = name');
		assert.throws(() => validateRequest({ action: 'confirm_sql_mutation', sql: ' ', database: 'oetrunk' }),
			{ message: 'SQL and database are required for confirm_sql_mutation.' });
	});

	test('preserves the first validation error for each action group', () => {
		const cases: Array<[unknown, string]> = [
			[{ action: 'unknown', id: 0 }, 'Unknown navigation action.'],
			[{ action: 'open_method', id: 0 }, 'Navigation ID must be a positive integer.'],
			[{ action: 'reveal_method', id: 1, classId: 0 }, 'Navigation classId must be a positive integer for reveal_method.'],
			[{ action: 'update_method_source', id: 1, code: 42 }, 'Code must be a string for update_method_source.'],
			[{ action: 'compile_method', id: 1 }, 'expectedDatabase, expectedHost and expectedPort are required for compile_method.'],
			[{ action: 'bind_objects_to_package', objectIds: [] }, 'objectIds must contain 1 to 100 positive integers for bind_objects_to_package.'],
			[{ action: 'get_package_sync_changes', offset: -1, limit: 10 }, 'Package synchronization offset must be a non-negative integer.'],
			[{ action: 'get_production_task', query: ' ', limit: 1 }, 'Production task query must be a non-empty string.'],
			[{ action: 'open_client_entity', id: 1, role: 'main' }, 'entityType is required for open_client_entity.'],
			[{ action: 'call_http_test_server', httpMethod: 'GET', headers: { Accept: 1 } }, 'HTTP headers must be an object with string values.'],
		];
		for (const [request, message] of cases) {
			assert.throws(() => validateRequest(request), { message });
		}
	});
});
