import * as vscode from 'vscode';
import * as path from 'node:path';
import { clientUsernameSetting, databaseProfileSetting, databaseRoleSetting, projectRootSetting } from '../core/constants';
import { loadClasses } from '../infrastructure/database/classRepository';
import { getProjectDatabaseOptions, getProjectDatabaseOptionsForDatabase } from '../infrastructure/configuration/projectDatabaseOptions';
import { applyProjectEncoding } from '../features/project/projectEncodingService';
import { SettingsViewProvider } from '../features/settings/settingsViewProvider';
import { closeClassDetailPanels, openClassDetails, restoreClassDetailPanels, revealClassMethod } from '../features/classes/views/classDetailsPanelManager';
import { ExplorerViewProvider } from '../features/explorer/explorerViewProvider';
import { sqlMonitorService } from '../features/sql-monitor/sqlMonitorService';
import { SqlExecutorViewProvider } from '../features/sql-executor/sqlExecutorViewProvider';
import { registerMethodEditor } from '../features/methods/methodEditorProvider';
import { registerMethodLanguageFeatures } from '../features/methods/methodLanguageFeatures';
import { registerCodeHistory } from '../features/code-history/codeHistoryService';
import { PackageSyncPanelManager } from '../features/package-sync/packageSyncViewProvider';
import { loadPackageSyncItems, loadPackageSyncSnapshot } from '../infrastructure/database/packageSyncRepository';
import { loadPackageDatabaseVersion } from '../infrastructure/database/packageSyncDiffRepository';
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
import { getActiveDatabaseSelectionPath, getDatabaseSelectionPath, writeDatabaseSelection } from '../core/databaseSelection';
import { openProjectClientEntity, startProjectClient, updateProjectBinaries, updateProjectDatabase, updateProjectPackages } from '../features/project/projectCommandService';
import { registerClipboardObjectNavigation } from '../features/explorer/clipboardObjectNavigation';
import { ProductionTasksPanelManager, registerProductionTasksActivityLauncher } from '../features/production-tasks/productionTasksViewProvider';
import { loadProductionTaskActions, loadProductionTaskAttachments, loadProductionTaskHistory, loadProductionTaskReference, loadProductionTasks, loadProductionTasksByQuery } from '../features/production-tasks/productionTasksRepository';
import { openProductionTaskDetails } from '../features/production-tasks/productionTaskDetailsPanel';
import { extractCapturedAuthorization, extractClientSessionKey, extractCurrentPersonId } from '../features/production-tasks/oenpProtocol';
import type { CapturedAuthorization, ProductionTaskSummary } from '../features/production-tasks/models';
import { closeSpuEditorPanels } from '../features/spu/spuEditorPanel';
import { createClassAttribute } from '../infrastructure/database/attributeRepository';
import { loadPackageFileContent, loadPackages, loadPackageTree } from '../infrastructure/database/packageExplorerRepository';
import { closePackageContentPanels, openPackageContent } from '../features/packages/packageContentPanelManager';
import { executeOeStaticMethod, startClientMcpProcess } from '../features/lifecycle/oeStaticMethodExecutor';
import { createClassMethod } from '../infrastructure/database/methodRepository';
import { disposeProjectDatabaseSessions } from '../infrastructure/database/projectDatabaseSession';
import { registerDatabaseCommands } from './registerDatabaseCommands';
import { configureDatabaseQueryMonitor } from '../infrastructure/database/databaseQueryExecutor';

export async function activate(context: vscode.ExtensionContext) {
	const sqlMonitorHistoryPath = vscode.Uri.joinPath(context.globalStorageUri, 'sql-monitor', 'recent-queries.json').fsPath;
	await sqlMonitorService.initialize(sqlMonitorHistoryPath);
	configureDatabaseQueryMonitor(sqlMonitorService);
	const extensionLogger = new ExtensionLogService(context.globalStorageUri, context.extensionUri.fsPath, sqlMonitorService);
	await extensionLogger.initialize();
	let navigationBridge: NavigationBridge | undefined;
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const databaseSelectionPath = workspacePath ? getDatabaseSelectionPath(context.globalStorageUri.fsPath, workspacePath) : undefined;
	const activeDatabaseSelectionPath = getActiveDatabaseSelectionPath();
	const publishActiveDatabaseSelection = async () => {
		const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!currentWorkspacePath) { return; }
		const profile = vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, '');
		await writeDatabaseSelection(activeDatabaseSelectionPath, currentWorkspacePath, profile);
	};
	const clientPasswordKey = `vcVeTools.clientPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
	const productionAuthorizationReferenceKey = `vcVeTools.productionAuthorizationReference:${workspacePath?.toLowerCase() ?? 'default'}`;
	const productionPasswordKey = `vcVeTools.productionPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
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
	await publishActiveDatabaseSelection();
	const methodEditor = registerMethodEditor(context, async (draft, target) => {
		let databaseOptions;
		if (target) {
			const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!currentWorkspacePath) { throw new Error('Открытая папка проекта не найдена.'); }
			databaseOptions = await getProjectDatabaseOptionsForDatabase(currentWorkspacePath, target.database, target.host);
		} else {
			databaseOptions = await getProjectDatabaseOptions();
		}
		const created = await createClassMethod(draft, databaseOptions);
		return { ...created, databaseOptions };
	});
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
		loadPackages,
		loadPackageTree,
		loadPackageFileContent,
		(fileId, objectId) => openPackageContent(context, fileId, objectId, async (id, kind) => {
			if (kind === 'class') { await openClassDetails(context, methodEditor, id, true); }
			else if (kind === 'method') { await methodEditor.open(id); }
			else if (kind === 'attribute') { await openAttributeDetails(context, id); }
			else { await openObjectView(context, id); }
		}),
	);
	const explorerRegistration = vscode.window.registerWebviewViewProvider(
		'vc-ve-tools.explorer',
		explorerProvider,
	);
	const getProductionConnectionOptions = async () => {
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const credentials = await getClientCredentials();
		const captureMetadata = await extractProductionMetadataFromCaptureDirectories(
			[workspacePath, context.extensionUri.fsPath].filter((value): value is string => Boolean(value)),
		);
		const storedAuthorization = parseStoredAuthorization(await context.secrets.get(productionAuthorizationReferenceKey));
		if (captureMetadata.authorization && !storedAuthorization) {
			await context.secrets.store(productionAuthorizationReferenceKey, JSON.stringify(captureMetadata.authorization));
		}
		let personId = configuration.get<number>('productionPersonId', 0);
		if (!/^\d{9}$/.test(String(personId))) {
			const detectedPersonId = captureMetadata.personId;
			if (detectedPersonId) {
				personId = detectedPersonId;
				await configuration.update('productionPersonId', personId, vscode.ConfigurationTarget.Workspace);
				extensionLogger.info('Production Tasks', 'Persons.ID автоматически найден в захвате рабочей области.');
			}
		}
		const authorizationReference = captureMetadata.authorization ?? storedAuthorization;
		const productionPassword = await context.secrets.get(productionPasswordKey);
		const productionUsername = authorizationReference?.username ?? credentials.username;
		const effectivePassword = productionPassword ?? credentials.password;
		if (!productionUsername || !effectivePassword) { throw new Error('Укажите пароль для production-задач.'); }
		if (!/^\d{9}$/.test(String(personId))) { throw new Error('Укажите девятизначный vcVeTools.productionPersonId (Persons.ID) или импортируйте его из veworks.pcapng.'); }
		return {
			host: configuration.get<string>('productionHost', '172.20.0.23'),
			port: configuration.get<number>('productionPort', 3060),
			database: configuration.get<string>('productionDatabase', 'ric224'),
			clientSessionKey: configuration.get<string>('productionClientSessionKey', ''),
			username: productionUsername,
			password: effectivePassword,
			personId,
			authorizationReference,
		};
	};
	const productionTasksLogger = {
		info: (message: string, details?: unknown) => extensionLogger.info('Production Tasks', message, details),
		warning: (message: string, details?: unknown) => extensionLogger.warning('Production Tasks', message, details),
		error: (message: string, details?: unknown) => extensionLogger.error('Production Tasks', message, details),
	};
	const findDatabaseObjectById = async (id: number) => (await searchDatabaseObjects(String(id), 1))[0];
	const showProductionTask = (task: ProductionTaskSummary): void => openProductionTaskDetails(
		context,
		task,
		findDatabaseObjectById,
		async reference => loadProductionTaskReference(await getProductionConnectionOptions(), reference, productionTasksLogger),
		showProductionTask,
		async () => loadProductionTaskActions(await getProductionConnectionOptions(), task.id, productionTasksLogger),
		async () => loadProductionTaskAttachments(await getProductionConnectionOptions(), task.id, productionTasksLogger),
		async () => loadProductionTaskHistory(await getProductionConnectionOptions(), task.id, productionTasksLogger),
	);
	const productionTasksProvider = new ProductionTasksPanelManager(
		context.extensionUri,
		getProductionConnectionOptions,
		showProductionTask,
		async () => {
			const selected = await vscode.window.showOpenDialog({
				canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
				defaultUri: workspacePath ? vscode.Uri.file(workspacePath) : undefined,
				filters: { 'Wireshark capture': ['pcapng'] },
				openLabel: 'Импортировать настройки OENP',
			});
			if (!selected?.length) { return false; }
			const captures = new Map(selected.map(uri => [uri.fsPath.toLowerCase(), uri]));
			const captureDirectories = new Set(selected.map(uri => path.dirname(uri.fsPath)));
			if (workspacePath) { captureDirectories.add(workspacePath); }
			for (const directory of captureDirectories) {
				try {
					for (const [name, fileType] of await vscode.workspace.fs.readDirectory(vscode.Uri.file(directory))) {
						if (fileType === vscode.FileType.File && name.toLowerCase().endsWith('.pcapng')) {
							const uri = vscode.Uri.file(path.join(directory, name));
							captures.set(uri.fsPath.toLowerCase(), uri);
						}
					}
				} catch (error) {
					extensionLogger.warning('Production Tasks', 'Не удалось проверить соседние файлы захвата.', { directory, error: String(error) });
				}
			}
			let key: string | undefined;
			let personId: number | undefined;
			let authorization: CapturedAuthorization | undefined;
			for (const uri of captures.values()) {
				const capture = Buffer.from(await vscode.workspace.fs.readFile(uri));
				key ??= extractClientSessionKey(capture);
				personId ??= extractCurrentPersonId(capture);
				authorization ??= extractCapturedAuthorization(capture);
				if (key && personId && authorization) { break; }
			}
			if (!key && !personId) { void vscode.window.showErrorMessage('В захватах не найдены настройки клиентской сессии OENP.'); return false; }
			const configuration = vscode.workspace.getConfiguration('vcVeTools');
			if (key) { await configuration.update('productionClientSessionKey', key, vscode.ConfigurationTarget.Workspace); }
			if (personId) { await configuration.update('productionPersonId', personId, vscode.ConfigurationTarget.Workspace); }
			if (authorization) { await context.secrets.store(productionAuthorizationReferenceKey, JSON.stringify(authorization)); }
			extensionLogger.info('Production Tasks', 'Настройки из захвата импортированы.', { checkedCaptureFiles: captures.size, importedSessionKey: Boolean(key), importedPersonId: Boolean(personId), foundAuthorizationReference: Boolean(authorization) });
			void vscode.window.showInformationMessage(`Настройки OENP импортированы: ${[key && 'ключ сессии', personId && 'Persons.ID'].filter(Boolean).join(', ')}.`);
			return true;
		},
		async () => {
			const password = await vscode.window.showInputBox({
				title: 'Доступ к задачам production',
				prompt: 'Введите пароль, с которым Восточный Экспресс подключается к production. Он сохранится только в SecretStorage VS Code.',
				password: true,
				ignoreFocusOut: true,
				validateInput: value => value.length > 0 ? undefined : 'Пароль не может быть пустым.',
			});
			if (password === undefined) { return false; }
			await context.secrets.store(productionPasswordKey, password);
			extensionLogger.info('Production Tasks', 'Отдельный пароль production сохранён в SecretStorage.');
			return true;
		},
		productionTasksLogger,
		() => extensionLogger.show(),
	);
	const openProductionTasksCommand = vscode.commands.registerCommand('vc-ve-tools.openProductionTasks', () => productionTasksProvider.show());
	const productionTasksRegistration = registerProductionTasksActivityLauncher(productionTasksProvider);
	const clipboardObjectNavigation = registerClipboardObjectNavigation({
		findById: findDatabaseObjectById,
		revealClass: id => explorerProvider.revealClass(id),
		openClass: id => openClassDetails(context, methodEditor, id, true),
		revealMethod: (classId, methodId) => revealClassMethod(context, methodEditor, classId, methodId),
		openAttribute: async (classId, attributeId) => {
			await explorerProvider.revealClass(classId);
			await openAttributeDetails(context, attributeId);
		},
		openDictionary: (classId, objectId) => openClassObjects(context, classId, objectId),
		openMethod: id => methodEditor.open(id),
		openObject: id => openObjectView(context, id),
	});
	const navigationActions: NavigationActions = {
		revealClass: id => explorerProvider.revealClass(id),
		openClass: id => openClassDetails(context, methodEditor, id, true),
		openMethod: id => methodEditor.open(id),
		revealMethod: (classId, methodId) => revealClassMethod(context, methodEditor, classId, methodId),
		updateMethodSource: async (methodId, code) => methodEditor.save(methodId, code),
		createClassMethod: async (draft, database, host) => {
			const created = await methodEditor.create(draft, { database, host });
			await explorerProvider.revealClass(created.ownerClassId);
			return { methodId: created.id, ownerClassId: created.ownerClassId, name: created.name };
		},
		createClassAttribute: async draft => {
			const created = await createClassAttribute(draft);
			await explorerProvider.revealClass(created.ownerClassId);
			await openAttributeDetails(context, created.id);
			return { attributeId: created.id, ownerClassId: created.ownerClassId, name: created.name };
		},
		executeLifecycleMethod: async (methodId, methodParameter, database, host) => {
			if (!workspacePath) { throw new Error('Открытая папка проекта не найдена.'); }
			const result = await executeOeStaticMethod(workspacePath, methodId, methodParameter, database, host, await getClientCredentials());
			extensionLogger.info('MCP method', `Выполнен статический метод ${methodId}.`, { database });
			return { ...result };
		},
		startClientMcp: async (database, host) => {
			if (!workspacePath) { throw new Error('Открытая папка проекта не найдена.'); }
			const result = await startClientMcpProcess(workspacePath, database, host, await getClientCredentials());
			extensionLogger.info('MCP client', 'Клиентский MCP автоматически запущен по запросу агента.', { database });
			return result;
		},
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
		getProductionTasks: async (query, limit) => {
			const options = await getProductionConnectionOptions();
			productionTasksLogger.info('MCP запросил список production-задач.', { query: query ?? null, limit });
			const tasks = await loadProductionTasks(options, productionTasksLogger);
			const normalizedQuery = query?.trim().toLocaleLowerCase('ru-RU');
			const filtered = normalizedQuery
				? tasks.filter(task => [task.id, task.number, task.title]
					.some(value => String(value).toLocaleLowerCase('ru-RU').includes(normalizedQuery)))
				: tasks;
			return {
				database: options.database,
				personId: options.personId,
				query: query ?? null,
				totalCount: filtered.length,
				count: Math.min(filtered.length, limit),
				truncated: filtered.length > limit,
				tasks: filtered.slice(0, limit).map(task => ({
					id: task.id, number: task.number, state: task.state, title: task.title,
					createdAt: task.createdAt, deadline: task.deadline, project: task.project, executor: task.executor,
				})),
			};
		},
		getProductionTask: async (query, limit) => {
			const options = await getProductionConnectionOptions();
			productionTasksLogger.info('MCP запросил полную production-задачу.', { query, limit });
			const tasks = await loadProductionTasksByQuery(options, query, limit, productionTasksLogger);
			return {
				database: options.database,
				query,
				count: tasks.length,
				match: tasks.length === 1 ? tasks[0] : null,
				tasks,
			};
		},
		getProductionTasksInProgress: async () => {
			const options = await getProductionConnectionOptions();
			productionTasksLogger.info('MCP запросил production-задачи в работе.');
			const tasks = (await loadProductionTasks(options, productionTasksLogger))
				.filter(task => task.state.trim().toLocaleLowerCase('ru-RU') === 'в работе');
			return { database: options.database, personId: options.personId, count: tasks.length, tasks };
		},
		updatePackages: () => updateProjectPackages(),
		updateBinaries: () => updateProjectBinaries(),
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
	const packageSyncProvider = new PackageSyncPanelManager(context.extensionUri, loadPackageSyncSnapshot, loadPackageDatabaseVersion);
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
		if (event.affectsConfiguration('vcVeTools.productionHost') || event.affectsConfiguration('vcVeTools.productionPort')
			|| event.affectsConfiguration('vcVeTools.productionDatabase') || event.affectsConfiguration('vcVeTools.productionClientSessionKey')
			|| event.affectsConfiguration('vcVeTools.productionPersonId')
			|| event.affectsConfiguration(`vcVeTools.${clientUsernameSetting}`)) {
			void productionTasksProvider.refresh();
		}
		if (event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`) || event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)) {
			await publishActiveDatabaseSelection();
			if (workspacePath && databaseSelectionPath) {
				await writeDatabaseSelection(databaseSelectionPath, workspacePath, vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, ''));
			}
			closeClassDetailPanels();
			closeAttributeDetailPanels();
			closePropertyDetailPanels();
			closeEntityPropertiesPanels();
			closeClassObjectPanels();
			closeObjectViewPanels();
			closePackageContentPanels();
			closeSpuEditorPanels();
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
	const activeWorkspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => void publishActiveDatabaseSelection());
	const activeWindowListener = vscode.window.onDidChangeWindowState((state) => {
		if (state.focused) { void publishActiveDatabaseSelection(); }
	});

	if (extensionConfiguration.get(projectRootSetting, false) && vscode.workspace.workspaceFolders?.length) {
		await applyProjectEncoding(context, true);
	}

	const databaseCommands = registerDatabaseCommands({
		context,
		copySelectedExplorerId: () => explorerProvider.copySelectedEntityId(),
		refreshSettings: () => settingsProvider.refresh(),
	});

	context.subscriptions.push(
		{ dispose: disposeProjectDatabaseSessions },
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
		productionTasksProvider,
		productionTasksRegistration,
		openProductionTasksCommand,
		clipboardObjectNavigation,
		packageSyncProvider,
		openPackageSyncCommand,
		sqlExecutorRegistration,
		configurationListener,
		activeWorkspaceListener,
		activeWindowListener,
		databaseCommands,
	);
}

async function extractProductionMetadataFromCaptureDirectories(directories: string[]): Promise<{ personId?: number; authorization?: CapturedAuthorization }> {
	let personId: number | undefined;
	let authorization: CapturedAuthorization | undefined;
	for (const directoryPath of new Set(directories.map(directory => path.resolve(directory)))) {
		try {
			const directory = vscode.Uri.file(directoryPath);
			for (const [name, fileType] of await vscode.workspace.fs.readDirectory(directory)) {
				if (fileType !== vscode.FileType.File || !name.toLowerCase().endsWith('.pcapng')) { continue; }
				const capture = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, name)));
				personId ??= extractCurrentPersonId(capture);
				authorization ??= extractCapturedAuthorization(capture);
				if (personId && authorization) { return { personId, authorization }; }
			}
		} catch { /* The explicit import action reports capture read failures. */ }
	}
	return { personId, authorization };
}

function parseStoredAuthorization(value: string | undefined): CapturedAuthorization | undefined {
	if (!value) { return undefined; }
	try {
		const parsed = JSON.parse(value) as Partial<CapturedAuthorization>;
		if (typeof parsed.username === 'string' && /^[A-F\d]{32}$/i.test(parsed.challenge ?? '')
			&& /^[A-F\d]{32}$/i.test(parsed.passwordHash ?? '') && /^[A-F\d]{32}$/i.test(parsed.oldPasswordHash ?? '')) {
			return parsed as CapturedAuthorization;
		}
	} catch { /* Ignore a stale or damaged SecretStorage entry. */ }
	return undefined;
}
