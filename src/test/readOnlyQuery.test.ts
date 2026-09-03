import * as assert from 'node:assert/strict';
import { prepareReadOnlyQuery } from '../mcp/readOnlyQuery';

suite('MCP read-only query guard', () => {
	test('accepts SELECT and adds a bounded outer limit', () => {
		const query = prepareReadOnlyQuery('-- inspect\nSELECT id FROM classes;', 25);
		assert.match(query, /SELECT id FROM classes/);
		assert.match(query, /LIMIT 26$/);
	});

	test('accepts WITH queries', () => {
		assert.match(prepareReadOnlyQuery('WITH data AS (SELECT 1 AS id) SELECT * FROM data'), /WITH data/);
	});

	test('rejects mutation statements', () => {
		for (const sql of ['UPDATE classes SET name = name', 'DELETE FROM classes', 'INSERT INTO classes DEFAULT VALUES', 'DROP TABLE classes']) {
			assert.throws(() => prepareReadOnlyQuery(sql), /Only SELECT/);
		}
	});

	test('caps the requested row limit', () => {
		assert.match(prepareReadOnlyQuery('VALUES (1)', 9999), /LIMIT 501$/);
	});
});
