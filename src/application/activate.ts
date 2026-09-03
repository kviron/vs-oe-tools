import * as vscode from 'vscode';
import { databaseRoleSetting, projectRootSetting } from '../core/constants';
import { loadClasses, testDatabaseConnection } from '../infrastructure/database/classRepository';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { applyProjectEncoding } from '../features/project/projectEncodingService';
import { SettingsViewProvider } from '../features/settings/settingsViewProvider';
import { closeClassDetailPanels, openClassDetails, restoreClassDetailPanels } from '../features/classes/views/classDetailsPanelManager';
import { ExplorerViewProvider } from '../features/explorer/explorerViewProvider';
import { openSqlMonitor } from '../features/sql-monitor/views/sqlMonitorPanelManager';
import { SqlExecutorViewProvider } from '../features/sql-executor/sqlExecutorViewProvider';
import { registerMethodEditor } from '../features/methods/methodEditorProvider';
import { registerMethodLanguageFeatures } from '../features/methods/methodLanguageFeatures';
import { registerCodeHistory } from '../features/code-history/codeHistoryService';
import { PackageSyncPanelManager } from '../features/package-sync/packageSyncViewProvider';
import { loadPackageSyncItems } from '../infrastructure/database/packageSyncRepository';
import { registerDatabaseMcpServer } from '../mcp/registerMcpServer';

export async function activate(context: vscode.ExtensionContext) {
	const databaseMcpServerRegistration = registerDatabaseMcpServer(context);
	const methodEditor = registerMethodEditor(context);
	registerCodeHistory(context, methodEditor);
	const extensionConfiguration = vscode.workspace.getConfiguration('vcVeTools');
	let isUpdatingSetting = false;
	const updateProjectRootSetting = async (enabled: boolean): Promise<void> => {

		if (!vscode.workspace.workspaceFolders?.length) {
			void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
			return;
		}

		try {
			isUpdatingSetting = true;
			await vscode.workspace.getConfiguration('vcVeTools').update(
				projectRootSetting,
				enabled,
				vscode.ConfigurationTarget.Workspace,
			);
			await applyProjectEncoding(context, enabled);
			void vscode.window.showInformationMessage(
				enabled
					? 'PKF, Pascal и BAT-файлы будут открываться в кодировке Cyrillic (Windows 1251).'
					: 'Кодировка PKF, Pascal и BAT-файлов восстановлена.',
			);
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
		} finally {
			isUpdatingSetting = false;
		}
	};
	const settingsProvider = new SettingsViewProvider(context.extensionUri, updateProjectRootSetting);
	const settingsRegistration = vscode.window.registerWebviewViewProvider(
		SettingsViewProvider.viewType,
		settingsProvider,
		{ webviewOptions: { retainContextWhenHidden: true } },
	);

	const explorerProvider = new ExplorerViewProvider(
		context.workspaceState,
		context.extensionUri,
		loadClasses,
		(id, pinned) => openClassDetails(context, methodEditor, id, pinned),
	);
	const explorerRegistration = vscode.window.registerWebviewViewProvider(
		'vc-ve-tools.explorer',
		explorerProvider,
	);
	const packageSyncProvider = new PackageSyncPanelManager(context.extensionUri, loadPackageSyncItems);
	const openPackageSyncCommand = vscode.commands.registerCommand(
		'vc-ve-tools.openPackageSync',
		() => packageSyncProvider.show(),
	);
	registerMethodLanguageFeatures(context, methodEditor, async (id) => {
		await explorerProvider.revealClass(id);
		await openClassDetails(context, methodEditor, id, true);
	});
	void restoreClassDetailPanels(context, methodEditor).catch((error) => {
		console.error('Не удалось восстановить панели классов:', error);
	});
	const sqlExecutorProvider = new SqlExecutorViewProvider(context.extensionUri);
	const sqlExecutorRegistration = vscode.window.registerWebviewViewProvider(
		SqlExecutorViewProvider.viewType,
		sqlExecutorProvider,
		{ webviewOptions: { retainContextWhenHidden: true } },
	);
	const configurationListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)) {
			closeClassDetailPanels();
			explorerProvider.refreshClasses();
			packageSyncProvider.refreshForDatabaseChange();
		}

		if (!isUpdatingSetting && event.affectsConfiguration(`vcVeTools.${projectRootSetting}`)) {
			const enabled = vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false);
			try {
				await applyProjectEncoding(context, enabled);
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
			}
		}
	});

	if (extensionConfiguration.get(projectRootSetting, false) && vscode.workspace.workspaceFolders?.length) {
		await applyProjectEncoding(context, true);
	}

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vc-ve-tools" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vc-ve-tools.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Восточный Экспресс расширение!');
	});
	const testDatabaseConnectionCommand = vscode.commands.registerCommand(
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
	const selectDatabaseRoleCommand = vscode.commands.registerCommand(
		'vc-ve-tools.selectDatabaseRole',
		async () => {
			if (!vscode.workspace.workspaceFolders?.length) {
				void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
				return;
			}

			const selected = await vscode.window.showQuickPick(
				[
					{ label: 'Основная', description: 'devDBName_main', role: 'main' as const },
					{ label: 'Тестовая', description: 'devDBName_test', role: 'test' as const },
				],
				{ placeHolder: 'Выберите базу данных' },
			);
			if (!selected || selected.role === getDatabaseRole()) {
				return;
			}

			await vscode.workspace.getConfiguration('vcVeTools').update(
				databaseRoleSetting,
				selected.role,
				vscode.ConfigurationTarget.Workspace,
			);
		},
	);
	const openSqlMonitorCommand = vscode.commands.registerCommand(
		'vc-ve-tools.openSqlMonitor',
		() => openSqlMonitor(context),
	);
	const copySelectedExplorerIdCommand = vscode.commands.registerCommand(
		'vc-ve-tools.copySelectedExplorerId',
		() => explorerProvider.copySelectedEntityId(),
	);
	const setUserIdCommand = vscode.commands.registerCommand(
		'vc-ve-tools.setUserId',
		async () => {
			const input = await vscode.window.showInputBox({
				placeHolder: '3130673',
				prompt: 'Введите ID пользователя из таблицы Users для логирования изменений методов',
				value: vscode.workspace.getConfiguration('vcVeTools').get<number>('userId', 0).toString(),
				validateInput: (value) => {
					if (!value.trim()) {
						return 'ID не может быть пустым';
					}
					const parsed = Number.parseInt(value, 10);
					if (!Number.isInteger(parsed) || parsed <= 0) {
						return 'ID должен быть положительным числом';
					}
					return '';
				},
			});

			if (input === undefined) {
				return;
			}

			const userId = Number.parseInt(input, 10);
			await vscode.workspace.getConfiguration('vcVeTools').update(
				'userId',
				userId,
				vscode.ConfigurationTarget.Workspace,
			);
			settingsProvider.refresh();
			void vscode.window.showInformationMessage(`ID пользователя установлен: ${userId}`);
		},
	);

	context.subscriptions.push(
		databaseMcpServerRegistration,
		settingsProvider,
		settingsRegistration,
		explorerProvider,
		explorerRegistration,
		packageSyncProvider,
		openPackageSyncCommand,
		sqlExecutorRegistration,
		configurationListener,
		disposable,
		testDatabaseConnectionCommand,
		selectDatabaseRoleCommand,
		openSqlMonitorCommand,
		copySelectedExplorerIdCommand,
		setUserIdCommand,
	);
}
