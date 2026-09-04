import * as vscode from 'vscode';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { mcpEnabledSetting } from '../core/constants';

export interface McpNavigationConnection {
	infoPath: string;
}

export function registerDatabaseMcpServer(context: vscode.ExtensionContext, logsPath: string, navigation: McpNavigationConnection): vscode.Disposable {
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
				'East Express Database (read-only)',
				process.execPath,
				[
					vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.js').fsPath,
					'--workspace', workspaceFolder.uri.fsPath,
					'--database-role', getDatabaseRole(),
					'--logs', logsPath,
					'--navigation-info', navigation.infoPath,
				],
				{},
				'0.5.0',
			);
			server.cwd = workspaceFolder.uri;
			return [server];
		},
	});
	const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('vcVeTools.databaseRole') || event.affectsConfiguration(`vcVeTools.${mcpEnabledSetting}`)) {
			changeEmitter.fire();
		}
	});
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => changeEmitter.fire());
	return vscode.Disposable.from(registration, configurationListener, workspaceListener, changeEmitter);
}
