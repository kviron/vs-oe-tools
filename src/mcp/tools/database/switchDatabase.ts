import { z } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { synchronizeDatabaseSelection, workspacePath, findDatabaseProfile, databaseSummary, setActiveDatabaseProfile, withMcpDatabaseSession } from '../../database';
import { loadRdboadmDatabases, rdboadmDatabaseOptions } from '../../../infrastructure/configuration/rdboadmIni';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('switch_database', {
		description: 'Switch this MCP process to another rdboadm.ini database profile. The connection is tested before the switch; all subsequent database tools use the selected profile.',
		inputSchema: { profile: z.string().min(1).describe('Section ID from list_databases, for example oetest') },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ profile }: { profile: string }) => databaseToolResult(async () => {
		await synchronizeDatabaseSelection();
		const { databases } = await loadRdboadmDatabases(workspacePath);
		const database = findDatabaseProfile(databases, profile);
		const options = rdboadmDatabaseOptions(database);
		return withMcpDatabaseSession(async ({ client }) => {
			const result = await client.query<{ database: string; server: string; port: number; user: string }>('SELECT current_database() AS database, inet_server_addr()::text AS server, inet_server_port() AS port, current_user AS user');
			setActiveDatabaseProfile(database.id);
			return { active: databaseSummary(database), connection: result.rows[0] };
		}, options, 'vc-ve-tools-mcp-switch-test');
	}));
}
