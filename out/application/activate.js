"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("node:path"));
const constants_1 = require("../core/constants");
const classRepository_1 = require("../infrastructure/database/classRepository");
const projectDatabaseOptions_1 = require("../infrastructure/configuration/projectDatabaseOptions");
const projectEncodingService_1 = require("../features/project/projectEncodingService");
const settingsViewProvider_1 = require("../features/settings/settingsViewProvider");
const classDetailsPanelManager_1 = require("../features/classes/views/classDetailsPanelManager");
const explorerViewProvider_1 = require("../features/explorer/explorerViewProvider");
const sqlMonitorPanelManager_1 = require("../features/sql-monitor/views/sqlMonitorPanelManager");
const sqlMonitorService_1 = require("../features/sql-monitor/sqlMonitorService");
const sqlExecutorViewProvider_1 = require("../features/sql-executor/sqlExecutorViewProvider");
const methodEditorProvider_1 = require("../features/methods/methodEditorProvider");
const methodLanguageFeatures_1 = require("../features/methods/methodLanguageFeatures");
const codeHistoryService_1 = require("../features/code-history/codeHistoryService");
const packageSyncViewProvider_1 = require("../features/package-sync/packageSyncViewProvider");
const packageSyncRepository_1 = require("../infrastructure/database/packageSyncRepository");
const registerMcpServer_1 = require("../mcp/registerMcpServer");
const extensionLogService_1 = require("../infrastructure/logging/extensionLogService");
const navigationTools_1 = require("../features/ai/navigationTools");
const navigationBridge_1 = require("../features/ai/navigationBridge");
const dfmEditorProvider_1 = require("../features/dfm/dfmEditorProvider");
const dfmPreview_1 = require("../features/dfm/dfmPreview");
const dfmLanguageFeatures_1 = require("../features/dfm/dfmLanguageFeatures");
const attributeDetailsPanelManager_1 = require("../features/classes/views/attributeDetailsPanelManager");
const propertyDetailsPanelManager_1 = require("../features/classes/views/propertyDetailsPanelManager");
const entityPropertiesPanelManager_1 = require("../features/classes/views/entityPropertiesPanelManager");
const objectSearchRepository_1 = require("../infrastructure/database/objectSearchRepository");
const agentSkillInstaller_1 = require("../features/ai/agentSkillInstaller");
const classObjectsPanelManager_1 = require("../features/classes/views/classObjectsPanelManager");
const objectViewPanelManager_1 = require("../features/classes/views/objectViewPanelManager");
const navigationInfo_1 = require("../core/navigationInfo");
const svnClient_1 = require("../features/code-history/svnClient");
const rdboadmIni_1 = require("../infrastructure/configuration/rdboadmIni");
const databaseSelection_1 = require("../core/databaseSelection");
const projectCommandService_1 = require("../features/project/projectCommandService");
const clipboardObjectNavigation_1 = require("../features/explorer/clipboardObjectNavigation");
const productionTasksViewProvider_1 = require("../features/production-tasks/productionTasksViewProvider");
const productionTasksRepository_1 = require("../features/production-tasks/productionTasksRepository");
const productionTaskDetailsPanel_1 = require("../features/production-tasks/productionTaskDetailsPanel");
const oenpProtocol_1 = require("../features/production-tasks/oenpProtocol");
const spuEditorPanel_1 = require("../features/spu/spuEditorPanel");
async function activate(context) {
    const sqlMonitorHistoryPath = vscode.Uri.joinPath(context.globalStorageUri, 'sql-monitor', 'recent-queries.json').fsPath;
    await sqlMonitorService_1.sqlMonitorService.initialize(sqlMonitorHistoryPath);
    const extensionLogger = new extensionLogService_1.ExtensionLogService(context.globalStorageUri, context.extensionUri.fsPath);
    await extensionLogger.initialize();
    let navigationBridge;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const databaseSelectionPath = workspacePath ? (0, databaseSelection_1.getDatabaseSelectionPath)(context.globalStorageUri.fsPath, workspacePath) : undefined;
    const clientPasswordKey = `vcVeTools.clientPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
    const productionAuthorizationReferenceKey = `vcVeTools.productionAuthorizationReference:${workspacePath?.toLowerCase() ?? 'default'}`;
    const productionPasswordKey = `vcVeTools.productionPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
    const getClientCredentials = async () => ({
        username: vscode.workspace.getConfiguration('vcVeTools').get(constants_1.clientUsernameSetting, ''),
        password: await context.secrets.get(clientPasswordKey),
    });
    const setClientCredentials = async (credentials) => {
        await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.clientUsernameSetting, credentials.username ?? '', vscode.ConfigurationTarget.Workspace);
        if (credentials.password) {
            await context.secrets.store(clientPasswordKey, credentials.password);
        }
    };
    if (workspacePath && databaseSelectionPath) {
        await (0, databaseSelection_1.writeDatabaseSelection)(databaseSelectionPath, workspacePath, vscode.workspace.getConfiguration('vcVeTools').get(constants_1.databaseProfileSetting, ''));
    }
    const methodEditor = (0, methodEditorProvider_1.registerMethodEditor)(context);
    const dfmEditor = (0, dfmEditorProvider_1.registerDfmEditor)(context);
    (0, dfmLanguageFeatures_1.registerDfmLanguageFeatures)(context, dfmEditor);
    (0, codeHistoryService_1.registerCodeHistory)(context, methodEditor);
    const extensionConfiguration = vscode.workspace.getConfiguration('vcVeTools');
    let isUpdatingSetting = false;
    const updateProjectRootSetting = async (enabled) => {
        if (!vscode.workspace.workspaceFolders?.length) {
            void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
            return;
        }
        try {
            isUpdatingSetting = true;
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.projectRootSetting, enabled, vscode.ConfigurationTarget.Workspace);
            await (0, projectEncodingService_1.applyProjectEncoding)(context, enabled);
            void vscode.window.showInformationMessage(enabled
                ? 'PKF, Pascal и BAT-файлы будут открываться в кодировке Cyrillic (Windows 1251).'
                : 'Кодировка PKF, Pascal и BAT-файлов восстановлена.');
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
        }
        finally {
            isUpdatingSetting = false;
        }
    };
    const settingsProvider = new settingsViewProvider_1.SettingsViewProvider(context.extensionUri, updateProjectRootSetting, extensionLogger, () => navigationBridge, databaseSelectionPath, getClientCredentials, setClientCredentials);
    const openSettingsCommand = vscode.commands.registerCommand('vc-ve-tools.openSettings', () => settingsProvider.show());
    const updateMainDatabaseCommand = vscode.commands.registerCommand('vc-ve-tools.updateMainDatabase', () => (0, projectCommandService_1.updateProjectDatabase)('main'));
    const updateTestDatabaseCommand = vscode.commands.registerCommand('vc-ve-tools.updateTestDatabase', () => (0, projectCommandService_1.updateProjectDatabase)('test'));
    const startMainClientCommand = vscode.commands.registerCommand('vc-ve-tools.startMainClient', async () => (0, projectCommandService_1.startProjectClient)('main', await getClientCredentials()));
    const startTestClientCommand = vscode.commands.registerCommand('vc-ve-tools.startTestClient', async () => (0, projectCommandService_1.startProjectClient)('test', await getClientCredentials()));
    const openClientEntityCommand = vscode.commands.registerCommand('vc-ve-tools.openClientEntity', async (role, entityType, id) => (0, projectCommandService_1.openProjectClientEntity)(role, entityType, id, await getClientCredentials()));
    const explorerProvider = new explorerViewProvider_1.ExplorerViewProvider(context.workspaceState, context.extensionUri, classRepository_1.loadClasses, (id, pinned) => (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, pinned), id => dfmEditor.open(id), id => (0, dfmPreview_1.openDfmPreview)(context, id), objectSearchRepository_1.searchDatabaseObjects, id => methodEditor.open(id), id => (0, attributeDetailsPanelManager_1.openAttributeDetails)(context, id), id => (0, classObjectsPanelManager_1.openClassObjects)(context, id), id => (0, objectViewPanelManager_1.openObjectView)(context, id), id => (0, entityPropertiesPanelManager_1.openEntityProperties)(context, id));
    const explorerRegistration = vscode.window.registerWebviewViewProvider('vc-ve-tools.explorer', explorerProvider);
    const getProductionConnectionOptions = async () => {
        const configuration = vscode.workspace.getConfiguration('vcVeTools');
        const credentials = await getClientCredentials();
        const captureMetadata = await extractProductionMetadataFromCaptureDirectories([workspacePath, context.extensionUri.fsPath].filter((value) => Boolean(value)));
        const storedAuthorization = parseStoredAuthorization(await context.secrets.get(productionAuthorizationReferenceKey));
        if (captureMetadata.authorization && !storedAuthorization) {
            await context.secrets.store(productionAuthorizationReferenceKey, JSON.stringify(captureMetadata.authorization));
        }
        let personId = configuration.get('productionPersonId', 0);
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
        if (!productionUsername || !effectivePassword) {
            throw new Error('Укажите пароль для production-задач.');
        }
        if (!/^\d{9}$/.test(String(personId))) {
            throw new Error('Укажите девятизначный vcVeTools.productionPersonId (Persons.ID) или импортируйте его из veworks.pcapng.');
        }
        return {
            host: configuration.get('productionHost', '172.20.0.23'),
            port: configuration.get('productionPort', 3060),
            database: configuration.get('productionDatabase', 'ric224'),
            clientSessionKey: configuration.get('productionClientSessionKey', ''),
            username: productionUsername,
            password: effectivePassword,
            personId,
            authorizationReference,
        };
    };
    const productionTasksLogger = {
        info: (message, details) => extensionLogger.info('Production Tasks', message, details),
        warning: (message, details) => extensionLogger.warning('Production Tasks', message, details),
        error: (message, details) => extensionLogger.error('Production Tasks', message, details),
    };
    const findDatabaseObjectById = async (id) => (await (0, objectSearchRepository_1.searchDatabaseObjects)(String(id), 1))[0];
    const productionTasksProvider = new productionTasksViewProvider_1.ProductionTasksPanelManager(context.extensionUri, getProductionConnectionOptions, task => (0, productionTaskDetailsPanel_1.openProductionTaskDetails)(context, task, findDatabaseObjectById, async () => (0, productionTasksRepository_1.loadProductionTaskAttachments)(await getProductionConnectionOptions(), task.id, productionTasksLogger)), async () => {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
            defaultUri: workspacePath ? vscode.Uri.file(workspacePath) : undefined,
            filters: { 'Wireshark capture': ['pcapng'] },
            openLabel: 'Импортировать настройки OENP',
        });
        if (!selected?.length) {
            return false;
        }
        const captures = new Map(selected.map(uri => [uri.fsPath.toLowerCase(), uri]));
        const captureDirectories = new Set(selected.map(uri => path.dirname(uri.fsPath)));
        if (workspacePath) {
            captureDirectories.add(workspacePath);
        }
        for (const directory of captureDirectories) {
            try {
                for (const [name, fileType] of await vscode.workspace.fs.readDirectory(vscode.Uri.file(directory))) {
                    if (fileType === vscode.FileType.File && name.toLowerCase().endsWith('.pcapng')) {
                        const uri = vscode.Uri.file(path.join(directory, name));
                        captures.set(uri.fsPath.toLowerCase(), uri);
                    }
                }
            }
            catch (error) {
                extensionLogger.warning('Production Tasks', 'Не удалось проверить соседние файлы захвата.', { directory, error: String(error) });
            }
        }
        let key;
        let personId;
        let authorization;
        for (const uri of captures.values()) {
            const capture = Buffer.from(await vscode.workspace.fs.readFile(uri));
            key ??= (0, oenpProtocol_1.extractClientSessionKey)(capture);
            personId ??= (0, oenpProtocol_1.extractCurrentPersonId)(capture);
            authorization ??= (0, oenpProtocol_1.extractCapturedAuthorization)(capture);
            if (key && personId && authorization) {
                break;
            }
        }
        if (!key && !personId) {
            void vscode.window.showErrorMessage('В захватах не найдены настройки клиентской сессии OENP.');
            return false;
        }
        const configuration = vscode.workspace.getConfiguration('vcVeTools');
        if (key) {
            await configuration.update('productionClientSessionKey', key, vscode.ConfigurationTarget.Workspace);
        }
        if (personId) {
            await configuration.update('productionPersonId', personId, vscode.ConfigurationTarget.Workspace);
        }
        if (authorization) {
            await context.secrets.store(productionAuthorizationReferenceKey, JSON.stringify(authorization));
        }
        extensionLogger.info('Production Tasks', 'Настройки из захвата импортированы.', { checkedCaptureFiles: captures.size, importedSessionKey: Boolean(key), importedPersonId: Boolean(personId), foundAuthorizationReference: Boolean(authorization) });
        void vscode.window.showInformationMessage(`Настройки OENP импортированы: ${[key && 'ключ сессии', personId && 'Persons.ID'].filter(Boolean).join(', ')}.`);
        return true;
    }, async () => {
        const password = await vscode.window.showInputBox({
            title: 'Доступ к задачам production',
            prompt: 'Введите пароль, с которым Восточный Экспресс подключается к production. Он сохранится только в SecretStorage VS Code.',
            password: true,
            ignoreFocusOut: true,
            validateInput: value => value.length > 0 ? undefined : 'Пароль не может быть пустым.',
        });
        if (password === undefined) {
            return false;
        }
        await context.secrets.store(productionPasswordKey, password);
        extensionLogger.info('Production Tasks', 'Отдельный пароль production сохранён в SecretStorage.');
        return true;
    }, productionTasksLogger, () => extensionLogger.show());
    const openProductionTasksCommand = vscode.commands.registerCommand('vc-ve-tools.openProductionTasks', () => productionTasksProvider.show());
    const productionTasksRegistration = (0, productionTasksViewProvider_1.registerProductionTasksActivityLauncher)(productionTasksProvider);
    const clipboardObjectNavigation = (0, clipboardObjectNavigation_1.registerClipboardObjectNavigation)({
        findById: findDatabaseObjectById,
        revealClass: id => explorerProvider.revealClass(id),
        openClass: id => (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, true),
        revealMethod: (classId, methodId) => (0, classDetailsPanelManager_1.revealClassMethod)(context, methodEditor, classId, methodId),
        openAttribute: async (classId, attributeId) => {
            await explorerProvider.revealClass(classId);
            await (0, attributeDetailsPanelManager_1.openAttributeDetails)(context, attributeId);
        },
        openDictionary: (classId, objectId) => (0, classObjectsPanelManager_1.openClassObjects)(context, classId, objectId),
        openMethod: id => methodEditor.open(id),
        openObject: id => (0, objectViewPanelManager_1.openObjectView)(context, id),
    });
    const navigationActions = {
        revealClass: id => explorerProvider.revealClass(id),
        openClass: id => (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, true),
        openMethod: id => methodEditor.open(id),
        revealMethod: (classId, methodId) => (0, classDetailsPanelManager_1.revealClassMethod)(context, methodEditor, classId, methodId),
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
            const entries = await (0, svnClient_1.svnLog)(resolvedPath, limit);
            return {
                filePath: resolvedPath,
                count: entries.length,
                entries: entries.map(entry => ({ revision: entry.revision, author: entry.author, date: entry.date.toISOString(), message: entry.message })),
            };
        },
        getPackageSyncChanges: async (query, offset, limit) => {
            const items = await (0, packageSyncRepository_1.loadPackageSyncItems)();
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
            const tasks = await (0, productionTasksRepository_1.loadProductionTasks)(options, productionTasksLogger);
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
        getProductionTasksInProgress: async () => {
            const options = await getProductionConnectionOptions();
            productionTasksLogger.info('MCP запросил production-задачи в работе.');
            const tasks = (await (0, productionTasksRepository_1.loadProductionTasks)(options, productionTasksLogger))
                .filter(task => task.state.trim().toLocaleLowerCase('ru-RU') === 'в работе');
            return { database: options.database, personId: options.personId, count: tasks.length, tasks };
        },
        updatePackages: () => (0, projectCommandService_1.updateProjectPackages)(),
        updateBinaries: () => (0, projectCommandService_1.updateProjectBinaries)(),
        updateDatabase: role => (0, projectCommandService_1.updateProjectDatabase)(role),
        startClient: async (role) => (0, projectCommandService_1.startProjectClient)(role, await getClientCredentials()),
        openClientEntity: async (role, entityType, id) => (0, projectCommandService_1.openProjectClientEntity)(role, entityType, id, await getClientCredentials()),
    };
    (0, navigationTools_1.registerNavigationTools)(context, navigationActions);
    navigationBridge = await (0, navigationBridge_1.startNavigationBridge)(navigationActions, vscode.workspace.workspaceFolders?.[0]
        ? (0, navigationInfo_1.getNavigationInfoPath)(vscode.workspace.workspaceFolders[0].uri.fsPath)
        : vscode.Uri.joinPath(context.globalStorageUri, 'navigation-bridge.json').fsPath);
    const databaseMcpServerRegistration = (0, registerMcpServer_1.registerDatabaseMcpServer)(context, extensionLogger.logUri.fsPath, navigationBridge, databaseSelectionPath, sqlMonitorHistoryPath);
    const agentSkillInstaller = (0, agentSkillInstaller_1.registerAgentSkillInstaller)(context);
    const packageSyncProvider = new packageSyncViewProvider_1.PackageSyncPanelManager(context.extensionUri, packageSyncRepository_1.loadPackageSyncItems);
    const openPackageSyncCommand = vscode.commands.registerCommand('vc-ve-tools.openPackageSync', () => packageSyncProvider.show());
    (0, methodLanguageFeatures_1.registerMethodLanguageFeatures)(context, methodEditor, async (id) => {
        await explorerProvider.revealClass(id);
        await (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, true);
    });
    void (0, classDetailsPanelManager_1.restoreClassDetailPanels)(context, methodEditor).catch((error) => {
        console.error('Не удалось восстановить панели классов:', error);
    });
    const sqlExecutorProvider = new sqlExecutorViewProvider_1.SqlExecutorViewProvider(context.extensionUri);
    const sqlExecutorRegistration = vscode.window.registerWebviewViewProvider(sqlExecutorViewProvider_1.SqlExecutorViewProvider.viewType, sqlExecutorProvider, { webviewOptions: { retainContextWhenHidden: true } });
    const configurationListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('vcVeTools.productionHost') || event.affectsConfiguration('vcVeTools.productionPort')
            || event.affectsConfiguration('vcVeTools.productionDatabase') || event.affectsConfiguration('vcVeTools.productionClientSessionKey')
            || event.affectsConfiguration('vcVeTools.productionPersonId')
            || event.affectsConfiguration(`vcVeTools.${constants_1.clientUsernameSetting}`)) {
            void productionTasksProvider.refresh();
        }
        if (event.affectsConfiguration(`vcVeTools.${constants_1.databaseRoleSetting}`) || event.affectsConfiguration(`vcVeTools.${constants_1.databaseProfileSetting}`)) {
            if (workspacePath && databaseSelectionPath) {
                await (0, databaseSelection_1.writeDatabaseSelection)(databaseSelectionPath, workspacePath, vscode.workspace.getConfiguration('vcVeTools').get(constants_1.databaseProfileSetting, ''));
            }
            (0, classDetailsPanelManager_1.closeClassDetailPanels)();
            (0, attributeDetailsPanelManager_1.closeAttributeDetailPanels)();
            (0, propertyDetailsPanelManager_1.closePropertyDetailPanels)();
            (0, entityPropertiesPanelManager_1.closeEntityPropertiesPanels)();
            (0, classObjectsPanelManager_1.closeClassObjectPanels)();
            (0, objectViewPanelManager_1.closeObjectViewPanels)();
            (0, spuEditorPanel_1.closeSpuEditorPanels)();
            explorerProvider.refreshClasses();
            packageSyncProvider.refreshForDatabaseChange();
        }
        if (!isUpdatingSetting && event.affectsConfiguration(`vcVeTools.${constants_1.projectRootSetting}`)) {
            const enabled = vscode.workspace.getConfiguration('vcVeTools').get(constants_1.projectRootSetting, false);
            try {
                await (0, projectEncodingService_1.applyProjectEncoding)(context, enabled);
            }
            catch (error) {
                void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
            }
        }
    });
    if (extensionConfiguration.get(constants_1.projectRootSetting, false) && vscode.workspace.workspaceFolders?.length) {
        await (0, projectEncodingService_1.applyProjectEncoding)(context, true);
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
    const testDatabaseConnectionCommand = vscode.commands.registerCommand('vc-ve-tools.testDatabaseConnection', async () => {
        try {
            const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Проверка подключения к базе',
            }, classRepository_1.testDatabaseConnection);
            void vscode.window.showInformationMessage(`Подключение установлено: ${result.database}, пользователь ${result.user}.`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Не удалось подключиться к базе: ${message}`);
        }
    });
    const selectDatabaseRoleCommand = vscode.commands.registerCommand('vc-ve-tools.selectDatabaseRole', async () => {
        if (!vscode.workspace.workspaceFolders?.length) {
            void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
            return;
        }
        try {
            const { databases } = await (0, rdboadmIni_1.loadRdboadmDatabases)(vscode.workspace.workspaceFolders[0].uri.fsPath);
            const selected = await vscode.window.showQuickPick(databases.map(database => ({ label: database.name, description: `[${database.id}]`, profile: database.id })), { placeHolder: 'Выберите базу данных из rdboadm.ini' });
            if (selected) {
                await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.databaseProfileSetting, selected.profile, vscode.ConfigurationTarget.Workspace);
            }
        }
        catch {
            const selected = await vscode.window.showQuickPick([{ label: 'Основная', role: 'main' }, { label: 'Тестовая', role: 'test' }], { placeHolder: 'Выберите базу данных' });
            if (selected && selected.role !== (0, projectDatabaseOptions_1.getDatabaseRole)()) {
                await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.databaseRoleSetting, selected.role, vscode.ConfigurationTarget.Workspace);
            }
        }
    });
    const openSqlMonitorCommand = vscode.commands.registerCommand('vc-ve-tools.openSqlMonitor', () => (0, sqlMonitorPanelManager_1.openSqlMonitor)(context));
    const copySelectedExplorerIdCommand = vscode.commands.registerCommand('vc-ve-tools.copySelectedExplorerId', () => explorerProvider.copySelectedEntityId());
    const setUserIdCommand = vscode.commands.registerCommand('vc-ve-tools.setUserId', async () => {
        const input = await vscode.window.showInputBox({
            placeHolder: '3130673',
            prompt: 'Введите ID пользователя из таблицы Users для логирования изменений методов',
            value: vscode.workspace.getConfiguration('vcVeTools').get('userId', 0).toString(),
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
        await vscode.workspace.getConfiguration('vcVeTools').update('userId', userId, vscode.ConfigurationTarget.Workspace);
        settingsProvider.refresh();
        void vscode.window.showInformationMessage(`ID пользователя установлен: ${userId}`);
    });
    context.subscriptions.push(extensionLogger, navigationBridge, databaseMcpServerRegistration, agentSkillInstaller, settingsProvider, openSettingsCommand, updateMainDatabaseCommand, updateTestDatabaseCommand, startMainClientCommand, startTestClientCommand, openClientEntityCommand, explorerProvider, explorerRegistration, productionTasksProvider, productionTasksRegistration, openProductionTasksCommand, clipboardObjectNavigation, packageSyncProvider, openPackageSyncCommand, sqlExecutorRegistration, configurationListener, disposable, testDatabaseConnectionCommand, selectDatabaseRoleCommand, openSqlMonitorCommand, copySelectedExplorerIdCommand, setUserIdCommand);
}
async function extractProductionMetadataFromCaptureDirectories(directories) {
    let personId;
    let authorization;
    for (const directoryPath of new Set(directories.map(directory => path.resolve(directory)))) {
        try {
            const directory = vscode.Uri.file(directoryPath);
            for (const [name, fileType] of await vscode.workspace.fs.readDirectory(directory)) {
                if (fileType !== vscode.FileType.File || !name.toLowerCase().endsWith('.pcapng')) {
                    continue;
                }
                const capture = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, name)));
                personId ??= (0, oenpProtocol_1.extractCurrentPersonId)(capture);
                authorization ??= (0, oenpProtocol_1.extractCapturedAuthorization)(capture);
                if (personId && authorization) {
                    return { personId, authorization };
                }
            }
        }
        catch { /* The explicit import action reports capture read failures. */ }
    }
    return { personId, authorization };
}
function parseStoredAuthorization(value) {
    if (!value) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed.username === 'string' && /^[A-F\d]{32}$/i.test(parsed.challenge ?? '')
            && /^[A-F\d]{32}$/i.test(parsed.passwordHash ?? '') && /^[A-F\d]{32}$/i.test(parsed.oldPasswordHash ?? '')) {
            return parsed;
        }
    }
    catch { /* Ignore a stale or damaged SecretStorage entry. */ }
    return undefined;
}
//# sourceMappingURL=activate.js.map