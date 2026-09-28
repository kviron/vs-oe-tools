import * as assert from 'node:assert/strict';
import path from 'node:path';
import type { McpRuntimeState } from '../core/mcpRuntimeState';
import { resolveWorkHistoryPath } from '../mcp/workHistory/path';

suite('Work history path', () => {
	const runtime: McpRuntimeState = {
		workspacePath: 'C:\\OE\\trunk', databaseRole: 'main',
		databaseSelectionPath: 'C:\\temp\\selection.json',
		logsPath: 'C:\\storage\\extension-log.jsonl',
		sqlMonitorHistoryPath: 'C:\\storage\\sql-monitor.json',
		navigationInfoPath: 'C:\\temp\\navigation.json',
		clientMcpUrl: 'http://localhost:8080', updatedAt: '2026-09-28T09:00:00Z',
		workHistoryPath: 'C:\\storage\\work-history.sqlite',
	};
	test('shares extension storage across workspaces', () => {
		assert.equal(resolveWorkHistoryPath(undefined, 'C:\\OE\\trunk', runtime), runtime.workHistoryPath);
		assert.equal(resolveWorkHistoryPath(undefined, 'C:\\OE\\R306', runtime), runtime.workHistoryPath);
		assert.equal(resolveWorkHistoryPath(undefined, 'C:\\OE\\trunk', { ...runtime, workHistoryPath: undefined }),
			path.join('C:\\storage', 'work-history.sqlite'));
	});
	test('keeps an explicit path and falls back when no extension is active', () => {
		assert.equal(resolveWorkHistoryPath('C:\\other\\history.sqlite', 'C:\\OE\\trunk', runtime),
			path.resolve('C:\\other\\history.sqlite'));
		assert.equal(resolveWorkHistoryPath(undefined, 'C:\\OE\\R306', undefined),
			path.join('C:\\OE\\R306', '.vc-ve-tools', 'work-history.sqlite'));
	});
});
