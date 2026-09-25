import * as vscode from 'vscode';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { clientMcpUrlSetting, databaseProfileSetting, mcpEnabledSetting } from '../core/constants';
import { buildDatabaseMcpArguments } from './database/arguments';

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
				buildDatabaseMcpArguments({
					serverPath: vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.js').fsPath,
					workspacePath: workspaceFolder.uri.fsPath,
					databaseRole: getDatabaseRole(),
					databaseProfile: vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, ''),
					databaseSelectionPath,
					logsPath,
					sqlMonitorHistoryPath,
					navigationInfoPath: navigation.infoPath,
					clientMcpUrl: vscode.workspace.getConfiguration('vcVeTools').get<string>(clientMcpUrlSetting, 'http://localhost:8080'),
				}),
				{},
				'0.22.0',
			);
			server.cwd = workspaceFolder.uri;
			return [server];
		},
	});
	const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('vcVeTools.databaseRole') || event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`) || event.affectsConfiguration(`vcVeTools.${mcpEnabledSetting}`) || event.affectsConfiguration(`vcVeTools.${clientMcpUrlSetting}`)) {
			changeEmitter.fire();
		}
	});
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => changeEmitter.fire());
	return vscode.Disposable.from(registration, configurationListener, workspaceListener, changeEmitter);
}
