import * as vscode from 'vscode';
import { databaseProfileSetting, databaseRoleSetting } from '../../core/constants';
import { getDatabaseRole } from '../../infrastructure/configuration/projectDatabaseOptions';
import { loadRdboadmDatabases } from '../../infrastructure/configuration/rdboadmIni';
import { testDatabaseConnection } from '../../infrastructure/database/classRepository';

export function registerProjectDatabaseCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('vc-ve-tools.testDatabaseConnection', async () => {
			try {
				const result = await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'Проверка подключения к базе' },
					testDatabaseConnection,
				);
				void vscode.window.showInformationMessage(`Подключение установлено: ${result.database}, пользователь ${result.user}.`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Не удалось подключиться к базе: ${message}`);
			}
		}),
		vscode.commands.registerCommand('vc-ve-tools.selectDatabaseRole', async () => {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) {
				void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
				return;
			}
			try {
				const { databases } = await loadRdboadmDatabases(workspacePath);
				const selected = await vscode.window.showQuickPick(
					databases.map(database => ({ label: database.name, description: `[${database.id}]`, profile: database.id })),
					{ placeHolder: 'Выберите базу данных из rdboadm.ini' },
				);
				if (selected) {
					await vscode.workspace.getConfiguration('vcVeTools').update(
						databaseProfileSetting, selected.profile, vscode.ConfigurationTarget.Workspace,
					);
				}
			} catch {
				const selected = await vscode.window.showQuickPick(
					[{ label: 'Основная', role: 'main' as const }, { label: 'Тестовая', role: 'test' as const }],
					{ placeHolder: 'Выберите базу данных' },
				);
				if (selected && selected.role !== getDatabaseRole()) {
					await vscode.workspace.getConfiguration('vcVeTools').update(
						databaseRoleSetting, selected.role, vscode.ConfigurationTarget.Workspace,
					);
				}
			}
		}),
	);
}
