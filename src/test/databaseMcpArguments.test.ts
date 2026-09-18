import * as assert from 'assert';
import { buildDatabaseMcpArguments } from '../mcp/databaseMcpArguments';

suite('Database MCP arguments', () => {
	test('includes SQL monitor history for generated and registered connections', () => {
		const args = buildDatabaseMcpArguments({
			serverPath: 'C:\\extension\\dist\\mcp-server.js',
			workspacePath: 'C:\\OE\\trunk',
			databaseRole: 'main',
			databaseProfile: 'oetrunk',
			databaseSelectionPath: 'C:\\storage\\database-selection.json',
			logsPath: 'C:\\storage\\logs',
			sqlMonitorHistoryPath: 'C:\\storage\\sql-monitor\\recent-queries.json',
			navigationInfoPath: 'C:\\storage\\navigation.json',
			clientMcpUrl: 'http://localhost:8080',
		});

		const historyFlag = args.indexOf('--sql-monitor-history');
		assert.ok(historyFlag >= 0);
		assert.strictEqual(args[historyFlag + 1], 'C:\\storage\\sql-monitor\\recent-queries.json');
	});
});
