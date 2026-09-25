import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

suite('MCP database queries', () => {
	test('uses read-only transactions and rolls back after success or failure', () => {
		const script = `
			const Module = require('node:module');
			const originalLoad = Module._load;
			const calls = [];
			let fail = false;
			let releases = 0;
			class Pool {
				on() { return this; }
				async connect() { return {
					query: async (sql, values) => {
						calls.push([sql, values]);
						if (sql === 'SELECT sample' && fail) { throw new Error('query failed'); }
						return { rows: [{ count: 2n, created: new Date('2026-01-01T00:00:00.000Z') }] };
					},
					release: () => { releases++; },
				}; }
			}
			Module._load = function(request, parent, isMain) {
				if (request === 'pg') { return { Pool }; }
				return originalLoad.call(this, request, parent, isMain);
			};
			require.cache[process.argv[2]] = { id: process.argv[2], filename: process.argv[2], loaded: true,
				exports: { loadActiveDatabaseOptions: async () => ({ host: 'localhost', port: 5432,
					database: 'test', user: 'test', password: 'secret' }) } };
			const { queryDatabase, queryDatabaseRaw } = require(process.argv[1]);
			(async () => {
				const normalized = await queryDatabase('SELECT sample', [1]);
				fail = true;
				const error = await queryDatabaseRaw('SELECT sample', [2]).then(() => '', value => value.message);
				console.log(JSON.stringify({ normalized, error, calls, releases }));
			})().catch(error => { console.error(error); process.exitCode = 1; });
		`;
		const result = spawnSync(process.execPath, ['-e', script,
			path.resolve(__dirname, '../mcp/database/queries.js'), path.resolve(__dirname, '../mcp/database/profile.js')],
			{ encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr);
		const output = JSON.parse(result.stdout) as { normalized: unknown; error: string; calls: Array<[string, unknown]>; releases: number };
		assert.deepEqual(output.normalized, [{ count: '2', created: '2026-01-01T00:00:00.000Z' }]);
		assert.equal(output.error, 'query failed');
		assert.deepEqual(output.calls.map(([sql]) => sql), [
			'BEGIN READ ONLY', "SET LOCAL statement_timeout = '10s'", "SET LOCAL lock_timeout = '2s'",
			'SELECT sample', 'ROLLBACK',
			'BEGIN READ ONLY', "SET LOCAL statement_timeout = '10s'", "SET LOCAL lock_timeout = '2s'",
			'SELECT sample', 'ROLLBACK',
		]);
		assert.equal(output.releases, 2);
	});
});
