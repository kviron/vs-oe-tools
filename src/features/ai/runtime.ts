import * as vscode from 'vscode';
import { clientMcpPreferIPv4Setting, clientMcpUrlSetting, databaseProfileSetting, databaseRoleSetting } from '../../core/constants';
import { writeMcpRuntimeState } from '../../core/mcpRuntimeState';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import type { NavigationBridge } from './navigationBridge';

interface Dependencies {
	bridge: NavigationBridge;
	activeDatabaseSelectionPath: string;
	sqlMonitorHistoryPath: string;
	workHistoryPath: string;
	logger: ExtensionLogService;
}

export function createMcpRuntimePublisher(dependencies: Dependencies): () => Promise<void> {
	const { bridge, activeDatabaseSelectionPath, sqlMonitorHistoryPath, workHistoryPath, logger } = dependencies;
	return async () => {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) { return; }
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		try {
			await writeMcpRuntimeState({
				workspacePath,
                mcpServerPath: vscode.extensions.getExtension('Kviron.vc-ve-tools') ? vscode.Uri.joinPath(vscode.extensions.getExtension('Kviron.vc-ve-tools')!.extensionUri,'dist','mcp-server.js').fsPath : undefined,
				databaseRole: configuration.get<'main' | 'test'>(databaseRoleSetting, 'main'),
				databaseProfile: configuration.get<string>(databaseProfileSetting, '') || undefined,
				databaseSelectionPath: activeDatabaseSelectionPath,
				logsPath: logger.logUri.fsPath,
				sqlMonitorHistoryPath,
				navigationInfoPath: bridge.infoPath,
				clientMcpUrl: configuration.get<string>(clientMcpUrlSetting, 'http://localhost:8080'),
				clientMcpPreferIPv4: configuration.get<boolean>(clientMcpPreferIPv4Setting, false),
				workHistoryPath,
				updatedAt: new Date().toISOString(),
			});
		} catch (error) {
			logger.warning('MCP', 'Не удалось опубликовать runtime-конфигурацию MCP.', error);
		}
	};
}
