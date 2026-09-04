import * as vscode from 'vscode';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { databaseProfileSetting, mcpEnabledSetting } from '../core/constants';

export interface McpNavigationConnection {
	infoPath: string;
}

export function registerDatabaseMcpServer(context: vscode.ExtensionContext, logsPath: string, navigation: McpNavigationConnection, databaseSelectionPath?: string, sqlMonitorHistoryPath?: string): vscode.Disposable {
	const changeEmitter = new vscode.EventEmitter<void>();
	const registration = vscode.lm.registerMcpServerDefinitionProvider('vc-ve-tools.database', {
		onDidChangeMcpServerDefinitions: changeEmitter.event,
		provideMcpServerDefinitions: () => {
			if (!vscode.workspace.getConfiguration('vcVeTools').get<boolean>(mcpEnabledSetting, true)) {
				return [];
			}
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				return [];
			}
			const server = new vscode.McpStdioServerDefinition(
				'East Express Database and Tools',
				process.execPath,
				[
					vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.js').fsPath,
					'--workspace', workspaceFolder.uri.fsPath,
					'--database-role', getDatabaseRole(),
					...(() => { const profile = vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, ''); return profile ? ['--database-profile', profile] : []; })(),
					...(databaseSelectionPath ? ['--database-selection', databaseSelectionPath] : []),
					'--logs', logsPath,
					...(sqlMonitorHistoryPath ? ['--sql-monitor-history', sqlMonitorHistoryPath] : []),
					'--navigation-info', navigation.infoPath,
				],
				{},
				'0.16.0',
			);
			server.cwd = workspaceFolder.uri;
			return [server];
		},
	});
	const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('vcVeTools.databaseRole') || event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`) || event.affectsConfiguration(`vcVeTools.${mcpEnabledSetting}`)) {
			changeEmitter.fire();
		}
	});
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => changeEmitter.fire());
	return vscode.Disposable.from(registration, configurationListener, workspaceListener, changeEmitter);
}
