import * as vscode from 'vscode';
import { clientMcpUrlSetting, databaseProfileSetting, databaseRoleSetting } from '../../core/constants';
import { writeMcpRuntimeState } from '../../core/mcpRuntimeState';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import type { NavigationBridge } from './navigationBridge';

interface Dependencies {
	bridge: NavigationBridge;
	activeDatabaseSelectionPath: string;
	sqlMonitorHistoryPath: string;
	logger: ExtensionLogService;
}

export function createMcpRuntimePublisher(dependencies: Dependencies): () => Promise<void> {
	const { bridge, activeDatabaseSelectionPath, sqlMonitorHistoryPath, logger } = dependencies;
	return async () => {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) { return; }
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		try {
			await writeMcpRuntimeState({
				workspacePath,
				databaseRole: configuration.get<'main' | 'test'>(databaseRoleSetting, 'main'),
				databaseProfile: configuration.get<string>(databaseProfileSetting, '') || undefined,
				databaseSelectionPath: activeDatabaseSelectionPath,
				logsPath: logger.logUri.fsPath,
				sqlMonitorHistoryPath,
				navigationInfoPath: bridge.infoPath,
				clientMcpUrl: configuration.get<string>(clientMcpUrlSetting, 'http://localhost:8080'),
				updatedAt: new Date().toISOString(),
			});
		} catch (error) {
			logger.warning('MCP', 'Не удалось опубликовать runtime-конфигурацию MCP.', error);
		}
	};
}
