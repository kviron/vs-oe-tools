export interface DatabaseMcpArgumentsOptions {
	serverPath: string;
	workspacePath: string;
	databaseRole: 'main' | 'test';
	databaseProfile?: string;
	databaseSelectionPath?: string;
	logsPath: string;
	sqlMonitorHistoryPath?: string;
	navigationInfoPath?: string;
	clientMcpUrl: string;
}

export function buildDatabaseMcpArguments(options: DatabaseMcpArgumentsOptions): string[] {
	return [
		options.serverPath,
		'--workspace', options.workspacePath,
		'--database-role', options.databaseRole,
		...(options.databaseProfile ? ['--database-profile', options.databaseProfile] : []),
		...(options.databaseSelectionPath ? ['--database-selection', options.databaseSelectionPath] : []),
		'--logs', options.logsPath,
		...(options.sqlMonitorHistoryPath ? ['--sql-monitor-history', options.sqlMonitorHistoryPath] : []),
		...(options.navigationInfoPath ? ['--navigation-info', options.navigationInfoPath] : []),
		'--client-mcp-url', options.clientMcpUrl,
	];
}
