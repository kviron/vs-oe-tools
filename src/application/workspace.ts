import * as vscode from 'vscode';
import { registerProjectDatabaseCommands, registerUserIdCommand } from '../features/project';
import { registerSqlMonitorCommand } from '../features/sql-monitor';
import { registerExplorerCommands } from '../features/explorer';
import { registerLifecycle } from './lifecycle';
import { createDatabaseChangeHandler } from './databaseChange';
import type { bootstrap } from './bootstrap';
import type { registerFeatures } from './features';
import type { registerMcp } from './mcp';
import type { registerWorkbench } from './workbench';

export async function registerWorkspace(
	context: vscode.ExtensionContext,
	app: Awaited<ReturnType<typeof bootstrap>>,
	features: ReturnType<typeof registerFeatures>,
	mcp: Awaited<ReturnType<typeof registerMcp>>,
	workbench: ReturnType<typeof registerWorkbench>,
): Promise<void> {
	context.subscriptions.push(registerLifecycle({
		onDatabaseConfigurationChange: createDatabaseChangeHandler({
			selection: app.selection, explorer: features.explorerProvider, packageSync: workbench.packageSyncProvider,
		}),
		onMcpConfigurationChange: mcp.onConfigurationChange,
		onProjectConfigurationChange: features.project.onConfigurationChange,
		publishActiveDatabaseSelection: app.selection.publishActive,
		publishMcpRuntimeState: mcp.publishRuntimeState,
	}));
	await features.project.initializeEncoding();
	registerProjectDatabaseCommands(context);
	registerSqlMonitorCommand(context);
	registerExplorerCommands(context, features.explorerProvider);
	registerUserIdCommand(context, () => features.project.settingsProvider.refresh());
}
