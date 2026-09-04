import * as vscode from 'vscode';
import * as path from 'node:path';
import { clientUsernameSetting, databaseProfileSetting, databaseRoleSetting, projectRootSetting } from '../core/constants';
import { loadClasses, testDatabaseConnection } from '../infrastructure/database/classRepository';
import { getDatabaseRole } from '../infrastructure/configuration/projectDatabaseOptions';
import { applyProjectEncoding } from '../features/project/projectEncodingService';
import { SettingsViewProvider } from '../features/settings/settingsViewProvider';
import { closeClassDetailPanels, openClassDetails, restoreClassDetailPanels, revealClassMethod } from '../features/classes/views/classDetailsPanelManager';
import { ExplorerViewProvider } from '../features/explorer/explorerViewProvider';
import { openSqlMonitor } from '../features/sql-monitor/views/sqlMonitorPanelManager';
import { sqlMonitorService } from '../features/sql-monitor/sqlMonitorService';
import { SqlExecutorViewProvider } from '../features/sql-executor/sqlExecutorViewProvider';
import { registerMethodEditor } from '../features/methods/methodEditorProvider';
import { registerMethodLanguageFeatures } from '../features/methods/methodLanguageFeatures';
import { registerCodeHistory } from '../features/code-history/codeHistoryService';
import { PackageSyncPanelManager } from '../features/package-sync/packageSyncViewProvider';
import { loadPackageSyncItems } from '../infrastructure/database/packageSyncRepository';
import { registerDatabaseMcpServer } from '../mcp/registerMcpServer';
import { ExtensionLogService } from '../infrastructure/logging/extensionLogService';
import { registerNavigationTools, type NavigationActions } from '../features/ai/navigationTools';
import { startNavigationBridge, type NavigationBridge } from '../features/ai/navigationBridge';
import { registerDfmEditor } from '../features/dfm/dfmEditorProvider';
import { openDfmPreview } from '../features/dfm/dfmPreview';
import { registerDfmLanguageFeatures } from '../features/dfm/dfmLanguageFeatures';
import { closeAttributeDetailPanels, openAttributeDetails } from '../features/classes/views/attributeDetailsPanelManager';
import { closePropertyDetailPanels } from '../features/classes/views/propertyDetailsPanelManager';
import { closeEntityPropertiesPanels, openEntityProperties } from '../features/classes/views/entityPropertiesPanelManager';
import { searchDatabaseObjects } from '../infrastructure/database/objectSearchRepository';
import { registerAgentSkillInstaller } from '../features/ai/agentSkillInstaller';
import { closeClassObjectPanels, openClassObjects } from '../features/classes/views/classObjectsPanelManager';
import { closeObjectViewPanels, openObjectView } from '../features/classes/views/objectViewPanelManager';
import { getNavigationInfoPath } from '../core/navigationInfo';
import { svnLog } from '../features/code-history/svnClient';
import { loadRdboadmDatabases } from '../infrastructure/configuration/rdboadmIni';
import { getDatabaseSelectionPath, writeDatabaseSelection } from '../core/databaseSelection';
import { openProjectClientEntity, startProjectClient, updateProjectDatabase } from '../features/project/projectCommandService';

export async function activate(context: vscode.ExtensionContext) {
	const sqlMonitorHistoryPath = vscode.Uri.joinPath(context.globalStorageUri, 'sql-monitor', 'recent-queries.json').fsPath;
	await sqlMonitorService.initialize(sqlMonitorHistoryPath);
	const extensionLogger = new ExtensionLogService(context.globalStorageUri, context.extensionUri.fsPath);
	await extensionLogger.initialize();
	let navigationBridge: NavigationBridge | undefined;
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const databaseSelectionPath = workspacePath ? getDatabaseSelectionPath(context.globalStorageUri.fsPath, workspacePath) : undefined;
	const clientPasswordKey = `vcVeTools.clientPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
	const getClientCredentials = async () => ({
		username: vscode.workspace.getConfiguration('vcVeTools').get<string>(clientUsernameSetting, ''),
		password: await context.secrets.get(clientPasswordKey),
	});
	const setClientCredentials = async (credentials: { username?: string; password?: string }) => {
		await vscode.workspace.getConfiguration('vcVeTools').update(clientUsernameSetting, credentials.username ?? '', vscode.ConfigurationTarget.Workspace);
		if (credentials.password) { await context.secrets.store(clientPasswordKey, credentials.password); }
	};
	if (workspacePath && databaseSelectionPath) {
		await writeDatabaseSelection(databaseSelectionPath, workspacePath, vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, ''));
	}
	const methodEditor = registerMethodEditor(context);
	const dfmEditor = registerDfmEditor(context);
	registerDfmLanguageFeatures(context, dfmEditor);
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
	const settingsProvider = new SettingsViewProvider(context.extensionUri, updateProjectRootSetting, extensionLogger, () => navigationBridge, databaseSelectionPath, getClientCredentials, setClientCredentials);
	const openSettingsCommand = vscode.commands.registerCommand('vc-ve-tools.openSettings', () => settingsProvider.show());
	const updateMainDatabaseCommand = vscode.commands.registerCommand('vc-ve-tools.updateMainDatabase', () => updateProjectDatabase('main'));
	const updateTestDatabaseCommand = vscode.commands.registerCommand('vc-ve-tools.updateTestDatabase', () => updateProjectDatabase('test'));
	const startMainClientCommand = vscode.commands.registerCommand('vc-ve-tools.startMainClient', async () => startProjectClient('main', await getClientCredentials()));
	const startTestClientCommand = vscode.commands.registerCommand('vc-ve-tools.startTestClient', async () => startProjectClient('test', await getClientCredentials()));
	const openClientEntityCommand = vscode.commands.registerCommand(
		'vc-ve-tools.openClientEntity',
		async (role: 'main' | 'test', entityType: string, id: number) => openProjectClientEntity(role, entityType, id, await getClientCredentials()),
	);

	const explorerProvider = new ExplorerViewProvider(
		context.workspaceState,
		context.extensionUri,
		loadClasses,
		(id, pinned) => openClassDetails(context, methodEditor, id, pinned),
		id => dfmEditor.open(id),
		id => openDfmPreview(context, id),
		searchDatabaseObjects,
		id => methodEditor.open(id),
		id => openAttributeDetails(context, id),
		id => openClassObjects(context, id),
		id => openObjectView(context, id),
		id => openEntityProperties(context, id),
	);
	const explorerRegistration = vscode.window.registerWebviewViewProvider(
		'vc-ve-tools.explorer',
		explorerProvider,
	);
	const navigationActions: NavigationActions = {
		revealClass: id => explorerProvider.revealClass(id),
		openClass: id => openClassDetails(context, methodEditor, id, true),
		openMethod: id => methodEditor.open(id),
		revealMethod: (classId, methodId) => revealClassMethod(context, methodEditor, classId, methodId),
		updateMethodSource: async (methodId, code) => methodEditor.save(methodId, code),
		getSvnFileHistory: async (filePath, limit) => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				throw new Error('Открытая папка проекта не найдена.');
			}
			const workspaceRoot = path.resolve(workspaceFolder.uri.fsPath);
			const resolvedPath = path.resolve(workspaceRoot, filePath);
			const relativePath = path.relative(workspaceRoot, resolvedPath);
			if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
				throw new Error('SVN-историю можно читать только для файлов открытого проекта.');
			}
			const entries = await svnLog(resolvedPath, limit);
			return {
				filePath: resolvedPath,
				count: entries.length,
				entries: entries.map(entry => ({ revision: entry.revision, author: entry.author, date: entry.date.toISOString(), message: entry.message })),
			};
		},
		getPackageSyncChanges: async (query, offset, limit) => {
			const items = await loadPackageSyncItems();
			const normalizedQuery = query?.trim().toLocaleLowerCase('ru');
			const filtered = normalizedQuery
				? items.filter(item => [item.objectId, item.objectName, item.objectPath, item.packagePath, item.changeState, item.localPath]
					.some(value => String(value ?? '').toLocaleLowerCase('ru').includes(normalizedQuery)))
				: items;
			return {
				query: query ?? null,
				offset,
				limit,
				totalCount: filtered.length,
				count: Math.min(limit, Math.max(0, filtered.length - offset)),
				hasMore: offset + limit < filtered.length,
				items: filtered.slice(offset, offset + limit),
			};
		},
		updateDatabase: role => updateProjectDatabase(role),
		startClient: async role => startProjectClient(role, await getClientCredentials()),
		openClientEntity: async (role, entityType, id) => openProjectClientEntity(role, entityType, id, await getClientCredentials()),
	};
	registerNavigationTools(context, navigationActions);
	navigationBridge = await startNavigationBridge(
		navigationActions,
		vscode.workspace.workspaceFolders?.[0]
			? getNavigationInfoPath(vscode.workspace.workspaceFolders[0].uri.fsPath)
			: vscode.Uri.joinPath(context.globalStorageUri, 'navigation-bridge.json').fsPath,
	);
	const databaseMcpServerRegistration = registerDatabaseMcpServer(context, extensionLogger.logUri.fsPath, navigationBridge, databaseSelectionPath, sqlMonitorHistoryPath);
	const agentSkillInstaller = registerAgentSkillInstaller(context);
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
		if (event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`) || event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)) {
			if (workspacePath && databaseSelectionPath) {
				await writeDatabaseSelection(databaseSelectionPath, workspacePath, vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, ''));
			}
			closeClassDetailPanels();
			closeAttributeDetailPanels();
			closePropertyDetailPanels();
			closeEntityPropertiesPanels();
			closeClassObjectPanels();
			closeObjectViewPanels();
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

			try {
				const { databases } = await loadRdboadmDatabases(vscode.workspace.workspaceFolders[0].uri.fsPath);
				const selected = await vscode.window.showQuickPick(databases.map(database => ({ label: database.name, description: `[${database.id}]`, profile: database.id })), { placeHolder: 'Выберите базу данных из rdboadm.ini' });
				if (selected) { await vscode.workspace.getConfiguration('vcVeTools').update(databaseProfileSetting, selected.profile, vscode.ConfigurationTarget.Workspace); }
			} catch {
				const selected = await vscode.window.showQuickPick([{ label: 'Основная', role: 'main' as const }, { label: 'Тестовая', role: 'test' as const }], { placeHolder: 'Выберите базу данных' });
				if (selected && selected.role !== getDatabaseRole()) { await vscode.workspace.getConfiguration('vcVeTools').update(databaseRoleSetting, selected.role, vscode.ConfigurationTarget.Workspace); }
			}
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
		extensionLogger,
		navigationBridge,
		databaseMcpServerRegistration,
		agentSkillInstaller,
		settingsProvider,
		openSettingsCommand,
		updateMainDatabaseCommand,
		updateTestDatabaseCommand,
		startMainClientCommand,
		startTestClientCommand,
		openClientEntityCommand,
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
