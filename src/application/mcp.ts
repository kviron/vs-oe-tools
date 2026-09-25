import type * as vscode from 'vscode';
import { clientMcpUrlSetting, databaseProfileSetting, databaseRoleSetting } from '../core/constants';
import { createMcpRuntimePublisher } from '../features/ai';
import { registerDatabaseMcpServer } from '../mcp/registerMcpServer';
import type { bootstrap } from './bootstrap';
import type { registerNavigation } from './navigation';

export async function registerMcp(
	context: vscode.ExtensionContext,
	app: Awaited<ReturnType<typeof bootstrap>>,
	navigation: Awaited<ReturnType<typeof registerNavigation>>,
) {
	const publishRuntimeState = createMcpRuntimePublisher({
		bridge: navigation.bridge,
		activeDatabaseSelectionPath: app.selection.activeDatabaseSelectionPath,
		sqlMonitorHistoryPath: app.sqlMonitorHistoryPath,
		logger: app.logger,
	});
	await publishRuntimeState();
	context.subscriptions.push(registerDatabaseMcpServer(
		context, app.logger.logUri.fsPath, navigation.bridge,
		app.selection.databaseSelectionPath, app.sqlMonitorHistoryPath,
	));
	return {
		publishRuntimeState,
		async onConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
			if (event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)
				|| event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)
				|| event.affectsConfiguration(`vcVeTools.${clientMcpUrlSetting}`)) {
				await publishRuntimeState();
			}
		},
	};
}
