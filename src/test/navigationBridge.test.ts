import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startNavigationBridge } from '../features/ai/navigationBridge';

suite('Navigation bridge', () => {
	test('publishes an authenticated endpoint and invokes the requested action', async () => {
		let openedMethod: number | undefined;
		let revealedMethod: { classId: number; methodId: number } | undefined;
		let updatedMethod: { methodId: number; code: string } | undefined;
		let updatedDatabase: 'main' | 'test' | undefined;
		let startedClient: 'main' | 'test' | undefined;
		const infoPath = join(tmpdir(), 'vc-ve-tools-test', `navigation-${process.pid}.json`);
		const bridge = await startNavigationBridge({
			revealClass: async () => undefined,
			openClass: async () => undefined,
			openMethod: async id => { openedMethod = id; },
			revealMethod: async (classId, methodId) => { revealedMethod = { classId, methodId }; },
			updateMethodSource: async (methodId, code) => {
				updatedMethod = { methodId, code };
				return { methodId, changed: true };
			},
			getSvnFileHistory: async (filePath, limit) => ({ filePath, limit, entries: [{ revision: 42 }] }),
			getPackageSyncChanges: async (query, offset, limit) => ({ query, offset, limit, items: [{ objectId: 7 }] }),
			updateDatabase: async role => { updatedDatabase = role; },
			startClient: async role => { startedClient = role; },
		}, infoPath);
		try {
			const connection = JSON.parse(await readFile(infoPath, 'utf8')) as { url: string; token: string };
			const response = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'open_method', id: 3200110 }),
			});
			assert.equal(response.status, 200);
			assert.equal(openedMethod, 3200110);
			const revealResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'reveal_method', id: 3200110, classId: 8921658 }),
			});
			assert.equal(revealResponse.status, 200);
			assert.deepEqual(revealedMethod, { classId: 8921658, methodId: 3200110 });
			const updateResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'update_method_source', id: 3200110, code: 'begin\r\nend' }),
			});
			assert.equal(updateResponse.status, 200);
			assert.deepEqual(updatedMethod, { methodId: 3200110, code: 'begin\r\nend' });
			const historyResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'get_svn_file_history', filePath: 'packages/example.pas', limit: 25 }),
			});
			assert.equal(historyResponse.status, 200);
			assert.deepEqual((await historyResponse.json() as { entries: unknown[] }).entries, [{ revision: 42 }]);
			const syncResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'get_package_sync_changes', query: 'method', offset: 10, limit: 50 }),
			});
			assert.equal(syncResponse.status, 200);
			assert.deepEqual((await syncResponse.json() as { items: unknown[] }).items, [{ objectId: 7 }]);
			const databaseResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'update_database', role: 'test' }),
			});
			assert.equal(databaseResponse.status, 200);
			assert.equal(updatedDatabase, 'test');
			const clientResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'start_client', role: 'main' }),
			});
			assert.equal(clientResponse.status, 200);
			assert.equal(startedClient, 'main');
		} finally {
			bridge.dispose();
		}
	});
});
