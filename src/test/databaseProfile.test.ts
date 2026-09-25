import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

suite('MCP database profile', () => {
	test('updates live session exports when selection changes', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'vc-ve-profile-test-'));
		try {
			const script = `
				const fs = require('node:fs/promises');
				const path = require('node:path');
				const modulePath = process.argv[1];
				const selectionPath = process.argv[2];
				const directory = process.argv[3];
				process.argv.push('--database-selection', selectionPath);
				const session = require(modulePath);
				const write = (workspacePath, profile, updatedAt) => fs.writeFile(selectionPath,
					JSON.stringify({ workspacePath, profile, updatedAt }));
				(async () => {
					await write(path.join(directory, 'one'), 'main', '1');
					await session.synchronizeDatabaseSelection();
					const first = [session.workspacePath, session.activeDatabaseProfile];
					await write(path.join(directory, 'one'), 'test', '2');
					await session.synchronizeDatabaseSelection();
					const second = [session.workspacePath, session.activeDatabaseProfile];
					await write(path.join(directory, 'two'), '', '3');
					await session.synchronizeDatabaseSelection();
					const third = [session.workspacePath, session.activeDatabaseProfile];
					console.log(JSON.stringify([first, second, third]));
				})().catch(error => { console.error(error); process.exitCode = 1; });
			`;
			const result = spawnSync(process.execPath, ['-e', script,
				path.resolve(__dirname, '../mcp/database/index.js'), path.join(directory, 'selection.json'), directory],
				{ encoding: 'utf8' });
			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(JSON.parse(result.stdout), [
				[path.join(directory, 'one'), 'main'],
				[path.join(directory, 'one'), 'test'],
				[path.join(directory, 'two'), null],
			]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
