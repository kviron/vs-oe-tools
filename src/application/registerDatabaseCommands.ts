import * as vscode from 'vscode';
import { databaseProfileSetting, databaseRoleSetting } from '../core/constants';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { loadRdboadmDatabases } from '../infrastructure/configuration/rdboadmIni';
import { testDatabaseConnection } from '../infrastructure/database/classRepository';
import { openSqlMonitor } from '../features/sql-monitor/views/sqlMonitorPanelManager';

interface DatabaseCommandDependencies {
	context: vscode.ExtensionContext;
	copySelectedExplorerId(): void | Promise<void>;
	refreshSettings(): void;
}

export function registerDatabaseCommands(dependencies: DatabaseCommandDependencies): vscode.Disposable {
	const testConnection = vscode.commands.registerCommand(
		'vc-ve-tools.testDatabaseConnection',
		async () => {
			try {
				const result = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Проверка подключения к базе',
					},
					testDatabaseConnection,
				);
				void vscode.window.showInformationMessage(
					`Подключение установлено: ${result.database}, пользователь ${result.user}.`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Не удалось подключиться к базе: ${message}`);
			}
		},
	);

	const selectDatabase = vscode.commands.registerCommand(
		'vc-ve-tools.selectDatabaseRole',
		async () => {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) {
				void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
				return;
			}

			try {
				const { databases } = await loadRdboadmDatabases(workspacePath);
				const selected = await vscode.window.showQuickPick(
					databases.map(database => ({
						label: database.name,
						description: `[${database.id}]`,
						profile: database.id,
					})),
					{ placeHolder: 'Выберите базу данных из rdboadm.ini' },
				);
				if (selected) {
					await vscode.workspace.getConfiguration('vcVeTools').update(
						databaseProfileSetting,
						selected.profile,
						vscode.ConfigurationTarget.Workspace,
					);
				}
			} catch {
				const selected = await vscode.window.showQuickPick(
					[
						{ label: 'Основная', role: 'main' as const },
						{ label: 'Тестовая', role: 'test' as const },
					],
					{ placeHolder: 'Выберите базу данных' },
				);
				if (selected && selected.role !== getDatabaseRole()) {
					await vscode.workspace.getConfiguration('vcVeTools').update(
						databaseRoleSetting,
						selected.role,
						vscode.ConfigurationTarget.Workspace,
					);
				}
			}
		},
	);

	const openMonitor = vscode.commands.registerCommand(
		'vc-ve-tools.openSqlMonitor',
		() => openSqlMonitor(dependencies.context),
	);
	const copySelectedId = vscode.commands.registerCommand(
		'vc-ve-tools.copySelectedExplorerId',
		() => dependencies.copySelectedExplorerId(),
	);
	const setUserId = vscode.commands.registerCommand(
		'vc-ve-tools.setUserId',
		async () => {
			const input = await vscode.window.showInputBox({
				placeHolder: '3130673',
				prompt: 'Введите ID пользователя из таблицы Users для логирования изменений методов',
				value: vscode.workspace.getConfiguration('vcVeTools').get<number>('userId', 0).toString(),
				validateInput: value => {
					if (!value.trim()) { return 'ID не может быть пустым'; }
					const parsed = Number.parseInt(value, 10);
					return Number.isInteger(parsed) && parsed > 0 ? '' : 'ID должен быть положительным числом';
				},
			});
			if (input === undefined) { return; }

			const userId = Number.parseInt(input, 10);
			await vscode.workspace.getConfiguration('vcVeTools').update(
				'userId',
				userId,
				vscode.ConfigurationTarget.Workspace,
			);
			dependencies.refreshSettings();
			void vscode.window.showInformationMessage(`ID пользователя установлен: ${userId}`);
		},
	);

	return vscode.Disposable.from(testConnection, selectDatabase, openMonitor, copySelectedId, setUserId);
}
