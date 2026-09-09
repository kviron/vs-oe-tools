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
		let productionTaskQuery: { query?: string; limit: number } | undefined;
		let packagesUpdated = false;
		let binariesUpdated = false;
		let createdAttributeName: string | undefined;
		let createdMethodName: string | undefined;
		let executedLifecycleMethod: { methodId: number; methodParameter: string; database: string; host: string } | undefined;
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
			createClassMethod: async draft => {
				createdMethodName = draft.name;
				return { methodId: 3200151, ownerClassId: draft.ownerClassId, name: draft.name };
			},
			createClassAttribute: async draft => {
				createdAttributeName = draft.name;
				return { attributeId: 3200144, ownerClassId: draft.ownerClassId, name: draft.name };
			},
			executeLifecycleMethod: async (methodId, methodParameter, database, host) => {
				executedLifecycleMethod = { methodId, methodParameter, database, host };
				return { methodId, database, output: 'ok' };
			},
			getSvnFileHistory: async (filePath, limit) => ({ filePath, limit, entries: [{ revision: 42 }] }),
			getPackageSyncChanges: async (query, offset, limit) => ({ query, offset, limit, items: [{ objectId: 7 }] }),
			getProductionTasks: async (query, limit) => {
				productionTaskQuery = { query, limit };
				return { count: 1, tasks: [{ id: 902173152, number: '85008' }] };
			},
			getProductionTasksInProgress: async () => ({ count: 1, tasks: [{ id: 902173152, state: 'В работе' }] }),
			updatePackages: async () => { packagesUpdated = true; return true; },
			updateBinaries: async () => { binariesUpdated = true; return false; },
			updateDatabase: async role => { updatedDatabase = role; },
			startClient: async role => { startedClient = role; },
			openClientEntity: async (role, entityType, id) => `oe-${role}:/open/${entityType}/${id}`,
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
			const createMethodResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'create_class_method', draft: {
					ownerClassId: 3200139, name: 'acTestExecute', visibilityId: 12450286,
					methodType: 3, methodKind: 0, signature: '', code: 'proc()\r\nbegin\r\nend;',
				} }),
			});
			assert.equal(createMethodResponse.status, 200);
			assert.equal(createdMethodName, 'acTestExecute');
			assert.equal((await createMethodResponse.json() as { methodId: number }).methodId, 3200151);
			const attributeResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'create_class_attribute', draft: {
					ownerClassId: 3200139, name: 'аТест', aliases: 'aTest', dbFieldName: 'aTest', attributeTypeId: 303,
					valueClasses: '', visibilityId: 12450284, distributionModeId: 12450505,
					isNotNull: false, virtual: true, refIntegrityCheck: false,
				} }),
			});
			assert.equal(attributeResponse.status, 200);
			assert.equal(createdAttributeName, 'аТест');
			assert.equal((await attributeResponse.json() as { attributeId: number }).attributeId, 3200144);
			const methodResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'execute_lifecycle_method', id: 3143815,
					methodParameter: 'paramName=A,paramKind=8927425', database: 'oetest', host: 'localhost' }),
			});
			assert.equal(methodResponse.status, 200);
			assert.deepEqual(executedLifecycleMethod, { methodId: 3143815, methodParameter: 'paramName=A,paramKind=8927425', database: 'oetest', host: 'localhost' });
			assert.equal((await methodResponse.json() as { output: string }).output, 'ok');
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
			const tasksResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'get_production_tasks', query: '85008', limit: 25 }),
			});
			assert.equal(tasksResponse.status, 200);
			assert.deepEqual(productionTaskQuery, { query: '85008', limit: 25 });
			assert.deepEqual((await tasksResponse.json() as { tasks: unknown[] }).tasks, [{ id: 902173152, number: '85008' }]);
			const inProgressResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'get_production_tasks_in_progress' }),
			});
			assert.equal(inProgressResponse.status, 200);
			assert.deepEqual((await inProgressResponse.json() as { tasks: unknown[] }).tasks, [{ id: 902173152, state: 'В работе' }]);
			const databaseResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'update_database', role: 'test' }),
			});
			assert.equal(databaseResponse.status, 200);
			assert.equal(updatedDatabase, 'test');
			const packagesResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'update_packages' }),
			});
			assert.equal(packagesResponse.status, 200);
			assert.equal((await packagesResponse.json() as { launched: boolean }).launched, true);
			assert.equal(packagesUpdated, true);
			const binariesResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'update_binaries' }),
			});
			assert.equal(binariesResponse.status, 200);
			assert.equal((await binariesResponse.json() as { launched: boolean }).launched, false);
			assert.equal(binariesUpdated, true);
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
