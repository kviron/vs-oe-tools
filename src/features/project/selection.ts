import * as vscode from 'vscode';
import { databaseProfileSetting } from '../../core/constants';
import { getActiveDatabaseSelectionPath, getDatabaseSelectionPath, writeDatabaseSelection } from '../../core/databaseSelection';

export function createDatabaseSelection(context: vscode.ExtensionContext, workspacePath: string | undefined) {
	const databaseSelectionPath = workspacePath ? getDatabaseSelectionPath(context.globalStorageUri.fsPath, workspacePath) : undefined;
	const activeDatabaseSelectionPath = getActiveDatabaseSelectionPath();
	const profile = () => vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, '');

	return {
		databaseSelectionPath,
		activeDatabaseSelectionPath,
		async publishActive(): Promise<void> {
			const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!currentWorkspacePath) { return; }
			await writeDatabaseSelection(activeDatabaseSelectionPath, currentWorkspacePath, profile());
		},
		async publishWorkspace(): Promise<void> {
			if (workspacePath && databaseSelectionPath) {
				await writeDatabaseSelection(databaseSelectionPath, workspacePath, profile());
			}
		},
	};
}
