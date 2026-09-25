import * as assert from 'node:assert/strict';
import { sql } from '../mcp/database';

suite('SQL tag', () => {
	test('keeps static SQL and rejects interpolated values', () => {
		assert.equal(sql`SELECT id FROM classes WHERE id = $1`, 'SELECT id FROM classes WHERE id = $1');
		assert.throws(() => (sql as (strings: TemplateStringsArray, ...values: unknown[]) => string)(
			Object.assign(['SELECT ', ' FROM classes'], { raw: ['SELECT ', ' FROM classes'] }), 'id',
		), /query parameters/);
	});
});
