import * as assert from 'node:assert/strict';
import { describeProductionMcpFailure, parseProductionMcpResult, ProductionMcpClient } from '../features/production-tasks/productionMcpClient';
import { mapProductionMcpTask, searchMcpTasks } from '../features/production-tasks/productionMcpRepository';
import { loadProductionTaskHistory } from '../features/production-tasks/productionTasksRepository';
import { createProductionAgentActions } from '../features/production-tasks/agent';
import { isSettingsWebviewMessage } from '../core/webviewProtocol';

suite('Public production MCP', () => {
	test('sends the production list request to oe_ur_list through the SDK', async () => {
		const originalFetch = globalThis.fetch;
		const tools: string[] = [];
		globalThis.fetch = async (_url, init) => {
			if (init?.method !== 'POST') { return new Response(null, { status: 405 }); }
			const request = JSON.parse(String(init.body));
			if (request.id === undefined) { return new Response(null, { status: 202 }); }
			let result: unknown;
			if (request.method === 'initialize') {
				result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'test-production', version: '1' } };
			} else {
				assert.equal(request.method, 'tools/call');
				tools.push(request.params.name);
				assert.deepEqual(request.params.arguments, { limit: 1 });
				result = { content: [{ type: 'text', text: '{"count":0,"item":[]}' }] };
			}
			return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'Content-Type': 'application/json' } });
		};
		try {
			assert.deepEqual(await new ProductionMcpClient('test-token').list({ limit: 1 }), []);
			assert.deepEqual(tools, ['oe_ur_list']);
		} finally { globalThis.fetch = originalFetch; }
	});
	test('retains tool error details while redacting credentials before truncation', () => {
		assert.throws(() => parseProductionMcpResult({ isError: true, content: [{ type: 'text', text: 'Unknown tool oe_url_list; token=other-secret; Bearer another-secret; supplied private-token' }] }, 'private-token'), error => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /Unknown tool oe_url_list/);
			assert.doesNotMatch(error.message, /other-secret|another-secret|private-token/);
			return true;
		});
	});
	test('preserves an HTTP failure from the SDK connection while dropping the response body', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response('private-token in server response', { status: 500 });
		try {
			await assert.rejects(new ProductionMcpClient('private-token').list({ limit: 1 }), error => {
				assert.ok(error instanceof Error);
				assert.match(error.message, /подключиться.*HTTP 500/);
				assert.doesNotMatch(error.message, /private-token/);
				return true;
			});
		} finally { globalThis.fetch = originalFetch; }
	});
	test('distinguishes connection, authorization, server and tool failures without exposing server text or secrets', () => {
		assert.match(describeProductionMcpFailure({ code: 500, message: 'Bearer private-token' }, 'connect'), /подключиться.*HTTP 500/);
		assert.match(describeProductionMcpFailure({ code: 401 }, 'connect'), /HTTP 401.*токен/);
		assert.match(describeProductionMcpFailure({ code: -32601 }, 'read'), /прочитать.*инструмент/);
		assert.match(describeProductionMcpFailure({ code: -32602 }, 'read'), /параметры/);
		assert.match(describeProductionMcpFailure({ cause: { code: 'ENOTFOUND' } }, 'connect'), /DNS/);
		assert.match(describeProductionMcpFailure({ name: 'TimeoutError' }, 'read'), /время ожидания/);
		assert.doesNotMatch(describeProductionMcpFailure({ code: 500, message: 'Bearer private-token' }, 'connect'), /private-token|Bearer/);
		assert.doesNotMatch(describeProductionMcpFailure(new Error('private-token'), 'read'), /private-token/);
		try { parseProductionMcpResult({ content: [{ type: 'text', text: 'private-token' }] }); }
		catch (error) { assert.match(describeProductionMcpFailure(error, 'read'), /некорректный JSON/); }
	});
	test('parses nested JSON and rejects tool errors and malformed responses', () => {
		assert.deepEqual(parseProductionMcpResult({ content: [{ type: 'text', text: '{"count":0,"item":[]}' }] }), { count: 0, item: [] });
		assert.throws(() => parseProductionMcpResult({ isError: true, content: [{ type: 'text', text: 'secret error' }] }), /не смог выполнить/);
		assert.throws(() => parseProductionMcpResult({ content: [{ type: 'text', text: '<html>error</html>' }] }), /некорректный JSON/);
	});
	test('preserves task ID, number, full content and marks incomplete MCP data', () => {
		const task = mapProductionMcpTask({ id: 952507978, number: 89328, subject: 'Лид-магниты', date: '2026-09-25T10:49:37.000', content: 'Строка 1\\u000D\\u000AСтрока 2' });
		assert.equal(task.id, 952507978);
		assert.equal(task.number, '89328');
		assert.equal(task.createdAt, '25.09.2026 10:49:37');
		assert.equal(task.workDescription, 'Строка 1\r\nСтрока 2');
		assert.equal(task.source, 'mcp');
		assert.equal(task.state, '');
		assert.equal(mapProductionMcpTask({ id: 1, number: 0, subject: 'Без номера', date: '' }).number, '');
	});
	test('reports unsupported history and requires an explicit in-progress folder without OENP fallback', async () => {
		const options = { transport: 'mcp', token: 'never sent', personId: 0, database: 'ric224' } as const;
		await assert.rejects(loadProductionTaskHistory(options, 952507978), /не предоставляет историю/);
		const actions = createProductionAgentActions(async () => options, { info() {}, warning() {}, error() {} });
		await assert.rejects(actions.getProductionTasksInProgress(), /передайте folder_uri/);
	});
	test('validates source selection and rejects multiline token messages', () => {
		assert.equal(isSettingsWebviewMessage({ command: 'setProductionTaskSource', value: 'mcp' }), true);
		assert.equal(isSettingsWebviewMessage({ command: 'setProductionTaskSource', value: 'unknown' }), false);
		assert.equal(isSettingsWebviewMessage({ command: 'setProductionMcpToken', value: 'one\ntwo' }), false);
	});
	test('keeps numeric searches inside the supplied folder and does not read the query as an unfiltered ID', async () => {
		const originalList = ProductionMcpClient.prototype.list;
		const originalView = ProductionMcpClient.prototype.view;
		const reads: number[][] = [];
		ProductionMcpClient.prototype.list = async args => {
			assert.equal(args.folder_uri, 'oe-ric224:/folder/123');
			assert.deepEqual(args.numbers, ['89328']);
			return [{ id: 7, number: 89328, subject: 'Filtered task', date: '' }];
		};
		ProductionMcpClient.prototype.view = async ids => {
			reads.push(ids);
			return [{ id: 7, number: 89328, subject: 'Filtered task', date: '' }];
		};
		try {
			const tasks = await searchMcpTasks({ transport: 'mcp', token: 'never sent', personId: 0, database: 'ric224' }, '89328', 10, 'oe-ric224:/folder/123');
			assert.deepEqual(reads, [[7]]);
			assert.deepEqual(tasks.map(task => task.id), [7]);
		} finally {
			ProductionMcpClient.prototype.list = originalList;
			ProductionMcpClient.prototype.view = originalView;
		}
	});
});
