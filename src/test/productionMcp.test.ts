import * as assert from 'node:assert/strict';
import { parseProductionMcpResult } from '../features/production-tasks/productionMcpClient';
import { mapProductionMcpTask } from '../features/production-tasks/productionMcpRepository';
import { loadProductionTaskHistory } from '../features/production-tasks/productionTasksRepository';
import { createProductionAgentActions } from '../features/production-tasks/agent';
import { isSettingsWebviewMessage } from '../core/webviewProtocol';

suite('Public production MCP', () => {
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
	test('reports unsupported history and in-progress filtering without OENP fallback', async () => {
		const options = { transport: 'mcp', token: 'never sent', personId: 0, database: 'ric224' } as const;
		await assert.rejects(loadProductionTaskHistory(options, 952507978), /не предоставляет историю/);
		const actions = createProductionAgentActions(async () => options, { info() {}, warning() {}, error() {} });
		await assert.rejects(actions.getProductionTasksInProgress(), /не предоставляет статус/);
	});
	test('validates source selection and rejects multiline token messages', () => {
		assert.equal(isSettingsWebviewMessage({ command: 'setProductionTaskSource', value: 'mcp' }), true);
		assert.equal(isSettingsWebviewMessage({ command: 'setProductionTaskSource', value: 'unknown' }), false);
		assert.equal(isSettingsWebviewMessage({ command: 'setProductionMcpToken', value: 'one\ntwo' }), false);
	});
});
