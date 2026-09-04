import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startNavigationBridge } from '../features/ai/navigationBridge';

suite('Navigation bridge', () => {
	test('publishes an authenticated endpoint and invokes the requested action', async () => {
		let openedMethod: number | undefined;
		let revealedMethod: { classId: number; methodId: number } | undefined;
		const infoPath = join(tmpdir(), 'vc-ve-tools-test', `navigation-${process.pid}.json`);
		const bridge = await startNavigationBridge({
			revealClass: async () => undefined,
			openClass: async () => undefined,
			openMethod: async id => { openedMethod = id; },
			revealMethod: async (classId, methodId) => { revealedMethod = { classId, methodId }; },
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
		} finally {
			bridge.dispose();
		}
	});
});
