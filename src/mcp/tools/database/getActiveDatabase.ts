import { databaseToolResult } from '../../toolResult';
import { synchronizeDatabaseSelection, workspacePath, findDatabaseProfile, activeDatabaseProfile, databaseSummary } from '../../database';
import { loadRdboadmDatabases } from '../../../infrastructure/configuration/rdboadmIni';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_active_database', {
		description: 'Return the database profile and actual PostgreSQL connection currently used by this MCP process.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => databaseToolResult(async () => {
		await synchronizeDatabaseSelection();
		const { databases } = await loadRdboadmDatabases(workspacePath);
		const database = findDatabaseProfile(databases, activeDatabaseProfile);
		return { active: databaseSummary(database) };
	}));
}
