import { databaseToolResult } from '../toolResult';
import { synchronizeDatabaseSelection, workspacePath, activeDatabaseProfile, databaseSummary } from '../databaseSession';
import { loadRdboadmDatabases } from '../../infrastructure/configuration/rdboadmIni';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('list_databases', {
		description: 'List database profiles from bin/rdboadm.ini in the opened project root, including section IDs, display names, safe connection details, and which profile is active in this MCP process.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => databaseToolResult(async () => {
		await synchronizeDatabaseSelection();
		const { path, databases } = await loadRdboadmDatabases(workspacePath);
		return {
			path,
			activeProfile: activeDatabaseProfile ?? databases[0]?.id ?? null,
			databases: databases.map(database => databaseSummary(database)),
		};
	}));
}
