import * as assert from 'node:assert/strict';
import { getRegisteredToolCatalog } from '../mcp/tools';
import { runFmeProbe } from '../mcp/tools/client/fmeAutomation';

suite('FME automation MCP', () => {
	test('exposes process, window, snapshot and input tools', () => {
		const names = getRegisteredToolCatalog().filter(tool => tool.name.startsWith('fme_')).map(tool => tool.name).sort();
		assert.deepEqual(names, ['fme_input', 'fme_list_processes', 'fme_list_windows', 'fme_snapshot']);
	});
	test('rejects a process that is not FME', async function () {
		if (process.platform !== 'win32') { this.skip(); }
		await assert.rejects(runFmeProbe({ pid: process.pid }), /Target process is not FME/);
	});
});
