import * as vscode from 'vscode';
import { sqlMonitorService } from '../features/sql-monitor';
import { createClientCredentials, createDatabaseSelection } from '../features/project';
import { ExtensionLogService } from '../infrastructure/logging/extensionLogService';
import { configureDatabaseQueryMonitor } from '../infrastructure/database/databaseQueryExecutor';
import { disposeProjectDatabaseSessions } from '../infrastructure/database/projectDatabaseSession';

export async function bootstrap(context: vscode.ExtensionContext) {
	const sqlMonitorHistoryPath = vscode.Uri.joinPath(context.globalStorageUri, 'sql-monitor', 'recent-queries.json').fsPath;
	await sqlMonitorService.initialize(sqlMonitorHistoryPath);
	configureDatabaseQueryMonitor(sqlMonitorService);
	const logger = new ExtensionLogService(context.globalStorageUri, context.extensionUri.fsPath, sqlMonitorService);
	await logger.initialize();
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const selection = createDatabaseSelection(context, workspacePath);
	const credentials = createClientCredentials(context, workspacePath);
	await selection.publishWorkspace();
	await selection.publishActive();
	context.subscriptions.push(logger, { dispose: disposeProjectDatabaseSessions });
	return { workspacePath, sqlMonitorHistoryPath, logger, selection, credentials };
}
