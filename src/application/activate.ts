import * as vscode from 'vscode';
import { databaseRoleSetting, projectRootSetting } from '../core/constants';
import { loadClasses, testDatabaseConnection } from '../infrastructure/database/classRepository';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { applyProjectEncoding } from '../features/project/projectEncodingService';
import { SettingsProvider } from '../features/settings/settingsProvider';
import { closeClassDetailPanels, openClassDetails } from '../features/classes/views/classDetailsPanelManager';
import { ExplorerViewProvider } from '../features/explorer/explorerViewProvider';

export async function activate(context: vscode.ExtensionContext) {
	const extensionConfiguration = vscode.workspace.getConfiguration('vcVeTools');
	let isUpdatingSetting = false;
	const settingsProvider = new SettingsProvider(
		extensionConfiguration.get(projectRootSetting, false),
		getDatabaseRole(),
	);
	const settingsView = vscode.window.createTreeView('vc-ve-tools.settings', {
		treeDataProvider: settingsProvider,
	});

	const updateProjectRootSetting = async (enabled: boolean): Promise<void> => {

		if (!vscode.workspace.workspaceFolders?.length) {
			settingsProvider.setProjectRootEnabled(false);
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
			settingsProvider.setProjectRootEnabled(enabled);
			void vscode.window.showInformationMessage(
				enabled
					? 'PKF, Pascal и BAT-файлы будут открываться в кодировке Cyrillic (Windows 1251).'
					: 'Кодировка PKF, Pascal и BAT-файлов восстановлена.',
			);
		} catch (error) {
			const currentValue = vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false);
			settingsProvider.setProjectRootEnabled(currentValue);
			void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
		} finally {
			isUpdatingSetting = false;
		}
	};

	const explorerProvider = new ExplorerViewProvider(
		context.extensionUri,
		loadClasses,
		(id, pinned) => openClassDetails(context, id, pinned),
	);
	const explorerRegistration = vscode.window.registerWebviewViewProvider(
		'vc-ve-tools.explorer',
		explorerProvider,
	);
	const checkboxListener = settingsView.onDidChangeCheckboxState((event) => {
		const enabled = event.items[0]?.[1] === vscode.TreeItemCheckboxState.Checked;
		void updateProjectRootSetting(enabled);
	});

	const configurationListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)) {
			settingsProvider.setDatabaseRole(getDatabaseRole());
			closeClassDetailPanels();
			explorerProvider.refreshClasses();
		}

		if (!isUpdatingSetting && event.affectsConfiguration(`vcVeTools.${projectRootSetting}`)) {
			const enabled = vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false);
			settingsProvider.setProjectRootEnabled(enabled);
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

	context.subscriptions.push(
		settingsProvider,
		settingsView,
		explorerProvider,
		explorerRegistration,
		checkboxListener,
		configurationListener,
		disposable,
		testDatabaseConnectionCommand,
		selectDatabaseRoleCommand,
	);
}

