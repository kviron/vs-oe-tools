import * as assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startNavigationBridge } from '../features/ai/navigationBridge';
import type { NavigationActions } from '../features/ai/navigationTools';

suite('Navigation bridge', () => {
	test('removes its own address file on dispose', async () => {
		const infoPath = join(tmpdir(), 'vc-ve-tools-test', `navigation-dispose-${process.pid}-${Date.now()}.json`);
		const bridge = await startNavigationBridge({} as NavigationActions, infoPath);
		assert.equal(JSON.parse(await readFile(infoPath, 'utf8')).token, bridge.token);
		bridge.dispose();
		for (let attempt = 0; attempt < 20; attempt++) {
			try { await readFile(infoPath, 'utf8'); }
			catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return; }
				throw error;
			}
			await new Promise(resolve => setTimeout(resolve, 20));
		}
		assert.fail('The bridge address file was not removed.');
	});
	test('rejects unauthorized requests and preserves a newer bridge address', async () => {
		const infoPath = join(tmpdir(), 'vc-ve-tools-test', `navigation-security-${process.pid}-${Date.now()}.json`);
		const bridge = await startNavigationBridge({} as NavigationActions, infoPath);
		try {
			const unauthorized = await fetch(bridge.url, {
				method: 'POST', body: JSON.stringify({ action: 'open_method', id: 1 }),
			});
			assert.equal(unauthorized.status, 401);
			const wrongRoute = await fetch(bridge.url.replace('/navigate', '/other'), {
				method: 'POST', headers: { authorization: `Bearer ${bridge.token}` },
			});
			assert.equal(wrongRoute.status, 404);
			await writeFile(infoPath, JSON.stringify({ url: 'http://127.0.0.1:1/navigate', token: 'newer' }));
		} finally {
			bridge.dispose();
		}
		try {
			await new Promise(resolve => setTimeout(resolve, 50));
			assert.equal(JSON.parse(await readFile(infoPath, 'utf8')).token, 'newer');
		} finally {
			await unlink(infoPath).catch(() => undefined);
		}
	});
	test('publishes an authenticated endpoint and invokes the requested action', async () => {
		let openedMethod: number | undefined;
		let revealedMethod: { classId: number; methodId: number } | undefined;
		let updatedMethod: { methodId: number; code: string; expectedDatabase: string; expectedHost: string; expectedPort: number } | undefined;
		let compiledMethod: { methodId: number; database: string; host: string; port: number } | undefined;
		let updatedModule: { moduleId: number; code: string; expectedDatabase: string; expectedHost: string; expectedPort: number } | undefined;
		let packageBinding: { objectIds: number[]; templateObjectId?: number; expectedDatabase: string;
			expectedHost: string; expectedPort: number } | undefined;
		let updatedDatabase: 'main' | 'test' | undefined;
		let startedClient: 'main' | 'test' | undefined;
		let productionTaskQuery: { query?: string; limit: number } | undefined;
		let fullProductionTaskQuery: { query: string; limit: number } | undefined;
		let packagesUpdated = false;
		let binariesUpdated = false;
		let createdAttributeName: string | undefined;
		let executedLifecycleMethod: { methodId: number; methodParameter: string; database: string; host: string } | undefined;
		let startedClientMcp: { database: string; host: string } | undefined;
		const infoPath = join(tmpdir(), 'vc-ve-tools-test', `navigation-${process.pid}.json`);
		const bridge = await startNavigationBridge({
			revealClass: async () => undefined,
			openClass: async () => undefined,
			openMethod: async id => { openedMethod = id; },
			revealMethod: async (classId, methodId) => { revealedMethod = { classId, methodId }; },
			updateMethodSource: async (methodId, code, expectedDatabase, expectedHost, expectedPort) => {
				updatedMethod = { methodId, code, expectedDatabase, expectedHost, expectedPort };
				return { methodId, changed: true, compilation: { passed: true, diagnostics: [] } };
			},
			compileMethod: async (methodId, database, host, port) => {
				compiledMethod = { methodId, database, host, port };
				return { timestamp: '2026-09-23T00:00:00.000Z', methodId, database, host,
					source: 'agent', status: 'ok', passed: true, errorCount: 0, warningCount: 0, diagnostics: [] };
			},
			getMethodCompilationHistory: async (methodId, limit) => ({ records: [{
				timestamp: '2026-09-23T00:00:00.000Z', methodId: methodId ?? 1, database: 'oetrunk', host: 'localhost',
				source: 'agent', status: 'ok', passed: true, errorCount: 0, warningCount: 0, diagnostics: [], error: String(limit),
			}] }),
			updateModuleSource: async (moduleId, code, expectedDatabase, expectedHost, expectedPort) => {
				updatedModule = { moduleId, code, expectedDatabase, expectedHost, expectedPort };
				return { moduleId, changed: true };
			},
			bindObjectsToPackage: async request => {
				packageBinding = request;
				return { database: request.expectedDatabase, changedObjectIds: request.objectIds };
			},
			createClassAttribute: async draft => {
				createdAttributeName = draft.name;
				return { attributeId: 3200144, ownerClassId: draft.ownerClassId, name: draft.name };
			},
			executeLifecycleMethod: async (methodId, methodParameter, database, host) => {
				executedLifecycleMethod = { methodId, methodParameter, database, host };
				return { methodId, database, output: 'ok' };
			},
			startClientMcp: async (database, host) => {
				startedClientMcp = { database, host };
				return { methodId: 12464780, database };
			},
			startHttpTestServer: async methodName => ({ running: true, methodName, url: 'http://127.0.0.1:18081/api' }),
			stopHttpTestServer: async () => ({ running: false }),
			getHttpTestServerStatus: async () => ({ running: false }),
			callHttpTestServer: async request => ({ response: { status: 200, ...request } }),
			getSvnFileHistory: async (filePath, limit) => ({ filePath, limit, entries: [{ revision: 42 }] }),
			getPackageSyncChanges: async (query, offset, limit) => ({ query, offset, limit, items: [{ objectId: 7 }] }),
			getProductionTasks: async (query, limit) => {
				productionTaskQuery = { query, limit };
				return { count: 1, tasks: [{ id: 902173152, number: '85008' }] };
			},
			getProductionTask: async (query, limit) => {
				fullProductionTaskQuery = { query, limit };
				return { count: 1, match: { id: 934593105, number: '88440', workDescription: 'Полное описание' } };
			},
			getProductionTasksInProgress: async () => ({ count: 1, tasks: [{ id: 902173152, state: 'В работе' }] }),
			updatePackages: async () => { packagesUpdated = true; return true; },
			updateBinaries: async () => { binariesUpdated = true; return false; },
			updateDatabase: async role => { updatedDatabase = role; },
			startClient: async role => { startedClient = role; },
			openClientEntity: async (role, entityType, id) => `oe-${role}:/open/${entityType}/${id}`,
			confirmSqlMutation: async () => false,
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
			const confirmationResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'confirm_sql_mutation', sql: 'UPDATE classes SET name = name', database: 'oetrunk' }),
			});
			assert.equal(confirmationResponse.status, 200);
			assert.equal((await confirmationResponse.json() as { approved: boolean }).approved, false);
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
				body: JSON.stringify({ action: 'update_method_source', id: 3200110, code: 'begin\r\nend',
					expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 }),
			});
			assert.equal(updateResponse.status, 200);
			assert.deepEqual(updatedMethod, { methodId: 3200110, code: 'begin\r\nend',
				expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 });
			assert.equal((await updateResponse.json() as { compilation: { passed: boolean } }).compilation.passed, true);
			const compileResponse = await fetch(connection.url, {
				method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'compile_method', id: 3200110,
					expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 }),
			});
			assert.equal(compileResponse.status, 200);
			assert.deepEqual(compiledMethod, { methodId: 3200110, database: 'oetrunk', host: 'localhost', port: 5432 });
			assert.equal((await compileResponse.json() as { result: { status: string } }).result.status, 'ok');
			const compilationHistoryResponse = await fetch(connection.url, {
				method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'get_method_compilation_history', id: 3200110, limit: 5 }),
			});
			assert.equal(compilationHistoryResponse.status, 200);
			assert.equal((await compilationHistoryResponse.json() as { records: Array<{ error: string }> }).records[0].error, '5');
			const updateModuleResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'update_module_source', id: 11894888, code: 'unit Report;\r\nend.',
					expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 }),
			});
			assert.equal(updateModuleResponse.status, 200);
			assert.deepEqual(updatedModule, { moduleId: 11894888, code: 'unit Report;\r\nend.',
				expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 });
			const bindingResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'bind_objects_to_package', objectIds: [3200234, 10826482],
					templateObjectId: 10826480, expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432 }),
			});
			assert.equal(bindingResponse.status, 200);
			assert.deepEqual(packageBinding, {
				objectIds: [3200234, 10826482], templateObjectId: 10826480, sysFileId: undefined,
				expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432,
			});
			assert.deepEqual((await bindingResponse.json() as { changedObjectIds: number[] }).changedObjectIds, [3200234, 10826482]);
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
			const startMcpResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'start_client_mcp', database: 'oetest', host: 'localhost' }),
			});
			assert.equal(startMcpResponse.status, 200);
			assert.deepEqual(startedClientMcp, { database: 'oetest', host: 'localhost' });
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
			const fullTaskResponse = await fetch(connection.url, {
				method: 'POST',
				headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'get_production_task', query: 'Связанные объекты', limit: 10 }),
			});
			assert.equal(fullTaskResponse.status, 200);
			assert.deepEqual(fullProductionTaskQuery, { query: 'Связанные объекты', limit: 10 });
			assert.deepEqual((await fullTaskResponse.json() as { match: unknown }).match, {
				id: 934593105, number: '88440', workDescription: 'Полное описание',
			});
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
			for (const httpMethod of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
				const headers = { Accept: 'application/json', 'X-Test': 'keep me' };
				const body = '{"message":"тест"}';
				const httpResponse = await fetch(connection.url, {
					method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
					body: JSON.stringify({ action: 'call_http_test_server', httpMethod, methodParameter: 'АнкетыСписок', headers, body }),
				});
				assert.equal(httpResponse.status, 200);
				assert.deepEqual((await httpResponse.json() as { response: unknown }).response, {
					status: 200, method: httpMethod, methodName: 'АнкетыСписок', headers, body,
				});
			}
			for (const invalid of [{ headers: [] }, { headers: { Accept: 42 } }, { body: {} }]) {
				const httpResponse = await fetch(connection.url, {
					method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
					body: JSON.stringify({ action: 'call_http_test_server', httpMethod: 'GET', ...invalid }),
				});
				assert.equal(httpResponse.status, 400);
			}
		} finally {
			bridge.dispose();
		}
	});
});
