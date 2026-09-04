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
async function activate(context) {
    const sqlMonitorHistoryPath = vscode.Uri.joinPath(context.globalStorageUri, 'sql-monitor', 'recent-queries.json').fsPath;
    await sqlMonitorService_1.sqlMonitorService.initialize(sqlMonitorHistoryPath);
    const extensionLogger = new extensionLogService_1.ExtensionLogService(context.globalStorageUri, context.extensionUri.fsPath);
    await extensionLogger.initialize();
    let navigationBridge;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const databaseSelectionPath = workspacePath ? (0, databaseSelection_1.getDatabaseSelectionPath)(context.globalStorageUri.fsPath, workspacePath) : undefined;
    const clientPasswordKey = `vcVeTools.clientPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
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
    const explorerProvider = new explorerViewProvider_1.ExplorerViewProvider(context.workspaceState, context.extensionUri, classRepository_1.loadClasses, (id, pinned) => (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, pinned), id => dfmEditor.open(id), id => (0, dfmPreview_1.openDfmPreview)(context, id), objectSearchRepository_1.searchDatabaseObjects, id => methodEditor.open(id), id => (0, attributeDetailsPanelManager_1.openAttributeDetails)(context, id), id => (0, classObjectsPanelManager_1.openClassObjects)(context, id), id => (0, objectViewPanelManager_1.openObjectView)(context, id), id => (0, entityPropertiesPanelManager_1.openEntityProperties)(context, id));
    const explorerRegistration = vscode.window.registerWebviewViewProvider('vc-ve-tools.explorer', explorerProvider);
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
        updateDatabase: role => (0, projectCommandService_1.updateProjectDatabase)(role),
        startClient: async (role) => (0, projectCommandService_1.startProjectClient)(role, await getClientCredentials()),
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
    context.subscriptions.push(extensionLogger, navigationBridge, databaseMcpServerRegistration, agentSkillInstaller, settingsProvider, openSettingsCommand, updateMainDatabaseCommand, updateTestDatabaseCommand, startMainClientCommand, startTestClientCommand, explorerProvider, explorerRegistration, packageSyncProvider, openPackageSyncCommand, sqlExecutorRegistration, configurationListener, disposable, testDatabaseConnectionCommand, selectDatabaseRoleCommand, openSqlMonitorCommand, copySelectedExplorerIdCommand, setUserIdCommand);
}
//# sourceMappingURL=activate.js.map