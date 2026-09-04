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
const constants_1 = require("../core/constants");
const classRepository_1 = require("../infrastructure/database/classRepository");
const projectDatabaseOptions_1 = require("../infrastructure/configuration/projectDatabaseOptions");
const projectEncodingService_1 = require("../features/project/projectEncodingService");
const settingsViewProvider_1 = require("../features/settings/settingsViewProvider");
const classDetailsPanelManager_1 = require("../features/classes/views/classDetailsPanelManager");
const explorerViewProvider_1 = require("../features/explorer/explorerViewProvider");
const sqlMonitorPanelManager_1 = require("../features/sql-monitor/views/sqlMonitorPanelManager");
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
async function activate(context) {
    const extensionLogger = new extensionLogService_1.ExtensionLogService(context.globalStorageUri, context.extensionUri.fsPath);
    await extensionLogger.initialize();
    let navigationBridge;
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
    const settingsProvider = new settingsViewProvider_1.SettingsViewProvider(context.extensionUri, updateProjectRootSetting, extensionLogger, () => navigationBridge);
    const settingsRegistration = vscode.window.registerWebviewViewProvider(settingsViewProvider_1.SettingsViewProvider.viewType, settingsProvider, { webviewOptions: { retainContextWhenHidden: true } });
    const explorerProvider = new explorerViewProvider_1.ExplorerViewProvider(context.workspaceState, context.extensionUri, classRepository_1.loadClasses, (id, pinned) => (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, pinned), id => dfmEditor.open(id), id => (0, dfmPreview_1.openDfmPreview)(context, id));
    const explorerRegistration = vscode.window.registerWebviewViewProvider('vc-ve-tools.explorer', explorerProvider);
    const navigationActions = {
        revealClass: id => explorerProvider.revealClass(id),
        openClass: id => (0, classDetailsPanelManager_1.openClassDetails)(context, methodEditor, id, true),
        openMethod: id => methodEditor.open(id),
    };
    (0, navigationTools_1.registerNavigationTools)(context, navigationActions);
    navigationBridge = await (0, navigationBridge_1.startNavigationBridge)(navigationActions, vscode.Uri.joinPath(context.globalStorageUri, 'navigation-bridge.json').fsPath);
    const databaseMcpServerRegistration = (0, registerMcpServer_1.registerDatabaseMcpServer)(context, extensionLogger.logUri.fsPath, navigationBridge);
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
        if (event.affectsConfiguration(`vcVeTools.${constants_1.databaseRoleSetting}`)) {
            (0, classDetailsPanelManager_1.closeClassDetailPanels)();
            (0, attributeDetailsPanelManager_1.closeAttributeDetailPanels)();
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
        const selected = await vscode.window.showQuickPick([
            { label: 'Основная', description: 'devDBName_main', role: 'main' },
            { label: 'Тестовая', description: 'devDBName_test', role: 'test' },
        ], { placeHolder: 'Выберите базу данных' });
        if (!selected || selected.role === (0, projectDatabaseOptions_1.getDatabaseRole)()) {
            return;
        }
        await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.databaseRoleSetting, selected.role, vscode.ConfigurationTarget.Workspace);
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
    context.subscriptions.push(extensionLogger, navigationBridge, databaseMcpServerRegistration, settingsProvider, settingsRegistration, explorerProvider, explorerRegistration, packageSyncProvider, openPackageSyncCommand, sqlExecutorRegistration, configurationListener, disposable, testDatabaseConnectionCommand, selectDatabaseRoleCommand, openSqlMonitorCommand, copySelectedExplorerIdCommand, setUserIdCommand);
}
//# sourceMappingURL=activate.js.map