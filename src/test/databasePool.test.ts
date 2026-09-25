import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

suite('MCP database pool', () => {
	test('reuses pools, releases clients and evicts the oldest pool', () => {
		const script = `
			const Module = require('node:module');
			const originalLoad = Module._load;
			const pools = [];
			class Pool {
				constructor(options) { this.options = options; this.releases = 0; this.closed = false; pools.push(this); }
				on() { return this; }
				async connect() { return { release: () => { this.releases++; } }; }
				async end() { this.closed = true; }
			}
			Module._load = function(request, parent, isMain) {
				if (request === 'pg') { return { Pool }; }
				return originalLoad.call(this, request, parent, isMain);
			};
			const { withDatabaseClient } = require(process.argv[1]);
			const options = index => ({ host: 'localhost', port: 5432, database: String(index), user: 'test', password: 'secret' });
			(async () => {
				await withDatabaseClient(options(0), 'app', async () => undefined);
				await withDatabaseClient(options(0), 'app', async () => { throw new Error('expected'); }).catch(() => undefined);
				for (let index = 1; index <= 8; index++) {
					await withDatabaseClient(options(index), 'app', async () => undefined);
				}
				console.log(JSON.stringify({ created: pools.length, releases: pools[0].releases,
					oldestClosed: pools[0].closed, newestClosed: pools[8].closed,
					configuration: [pools[0].options.max, pools[0].options.allowExitOnIdle] }));
			})().catch(error => { console.error(error); process.exitCode = 1; });
		`;
		const result = spawnSync(process.execPath, ['-e', script, path.resolve(__dirname, '../mcp/database/pool.js')],
			{ encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout), {
			created: 9, releases: 2, oldestClosed: true, newestClosed: false, configuration: [4, true],
		});
	});
});
