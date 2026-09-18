import * as assert from 'node:assert';
import { parseMcpRuntimeState } from '../core/mcpRuntimeState';

suite('MCP runtime state', () => {
	test('accepts the complete extension-published state', () => {
		const state = parseMcpRuntimeState({
			workspacePath: 'C:\\OE\\trunk',
			databaseRole: 'main',
			databaseProfile: 'oetrunk',
			databaseSelectionPath: 'C:\\Temp\\vc-ve-tools\\active-database-selection.json',
			logsPath: 'C:\\storage\\extension-log.jsonl',
			sqlMonitorHistoryPath: 'C:\\storage\\sql-monitor\\recent-queries.json',
			navigationInfoPath: 'C:\\Temp\\vc-ve-tools\\navigation.json',
			clientMcpUrl: 'http://localhost:8080',
			updatedAt: '2026-09-17T07:00:00.000Z',
		});

		assert.equal(state?.workspacePath, 'C:\\OE\\trunk');
		assert.equal(state?.sqlMonitorHistoryPath, 'C:\\storage\\sql-monitor\\recent-queries.json');
	});

	test('rejects incomplete or relative state', () => {
		assert.equal(parseMcpRuntimeState({ workspacePath: 'relative' }), undefined);
		assert.equal(parseMcpRuntimeState(null), undefined);
	});
});
