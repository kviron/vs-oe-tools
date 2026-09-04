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
exports.SettingsViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../../core/constants");
const webviewProtocol_1 = require("../../core/webviewProtocol");
const projectDatabaseOptions_1 = require("../../infrastructure/configuration/projectDatabaseOptions");
const classRepository_1 = require("../../infrastructure/database/classRepository");
const rdboadmIni_1 = require("../../infrastructure/configuration/rdboadmIni");
const projectCommandService_1 = require("../project/projectCommandService");
class SettingsViewProvider {
    extensionUri;
    setProjectRootEnabled;
    logger;
    getNavigationConnection;
    databaseSelectionPath;
    getClientCredentials;
    setClientCredentials;
    panel;
    disposables = [];
    constructor(extensionUri, setProjectRootEnabled, logger, getNavigationConnection, databaseSelectionPath, getClientCredentials = async () => ({}), setClientCredentials = async () => undefined) {
        this.extensionUri = extensionUri;
        this.setProjectRootEnabled = setProjectRootEnabled;
        this.logger = logger;
        this.getNavigationConnection = getNavigationConnection;
        this.databaseSelectionPath = databaseSelectionPath;
        this.getClientCredentials = getClientCredentials;
        this.setClientCredentials = setClientCredentials;
        this.disposables.push(this.logger.onDidChange(() => void this.postState()), vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('vcVeTools')) {
                void this.postState();
            }
        }), vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()));
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active);
            void this.postState();
            return;
        }
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        const panel = vscode.window.createWebviewPanel('vc-ve-tools.settings', 'Настройки Восточного Экспресса', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [assetsRoot],
        });
        this.panel = panel;
        panel.webview.html = this.getHtml(panel.webview, assetsRoot);
        panel.webview.onDidReceiveMessage(message => void this.handleMessage(message));
        panel.onDidDispose(() => { this.panel = undefined; });
    }
    refresh() {
        void this.postState();
    }
    dispose() {
        this.panel?.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
    }
    async handleMessage(message) {
        if (!(0, webviewProtocol_1.isSettingsWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'settingsReady') {
            await this.postState();
        }
        else if (message.command === 'setProjectRootEnabled') {
            await this.setProjectRootEnabled(message.enabled);
        }
        else if (message.command === 'setDatabaseRole') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.databaseRoleSetting, message.role, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'setDatabaseProfile') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.databaseProfileSetting, message.profile, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'saveDatabaseProfile') {
            const workspace = vscode.workspace.workspaceFolders?.[0];
            if (!workspace) {
                throw new Error('Сначала откройте папку проекта.');
            }
            try {
                await (0, rdboadmIni_1.saveRdboadmDatabase)(workspace.uri.fsPath, { id: message.profile, name: message.profile, fields: message.fields });
                void vscode.window.showInformationMessage(`Настройки базы [${message.profile}] сохранены в rdboadm.ini.`);
                await this.postState();
            }
            catch (error) {
                void vscode.window.showErrorMessage(`Не удалось сохранить rdboadm.ini: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else if (message.command === 'runProjectCommand') {
            try {
                if (message.action === 'updateDatabase') {
                    await (0, projectCommandService_1.updateProjectDatabase)(message.role);
                }
                else {
                    await (0, projectCommandService_1.startProjectClient)(message.role, await this.getClientCredentials());
                }
            }
            catch (error) {
                void vscode.window.showErrorMessage(`Не удалось выполнить команду проекта: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else if (message.command === 'setUserId') {
            await vscode.workspace.getConfiguration('vcVeTools').update('userId', message.userId, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'setClientCredentials') {
            await this.setClientCredentials({ username: message.username, password: message.password });
            void vscode.window.showInformationMessage('Данные входа клиента ВЭ сохранены.');
            await this.postState();
        }
        else if (message.command === 'setMcpEnabled') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.mcpEnabledSetting, message.enabled, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'testSettingsDatabaseConnection') {
            await this.testConnection();
        }
        else if (message.command === 'clearExtensionLogs') {
            await this.logger.clear();
            await this.postState();
        }
        else {
            await vscode.env.clipboard.writeText(message.text);
            vscode.window.setStatusBarMessage('Код подключения MCP скопирован', 2500);
        }
    }
    async testConnection() {
        this.post({ command: 'databaseConnectionTestStarted' });
        try {
            const result = await (0, classRepository_1.testDatabaseConnection)();
            this.post({ command: 'databaseConnectionTestFinished', success: true, message: `Подключено: ${result.database}, пользователь ${result.user}.` });
        }
        catch (error) {
            this.logger.error('Настройки', 'Проверка подключения к базе завершилась ошибкой', error);
            this.post({ command: 'databaseConnectionTestFinished', success: false, message: error instanceof Error ? error.message : String(error) });
        }
    }
    async postState() {
        if (!this.panel) {
            return;
        }
        this.post({ command: 'settingsState', state: await this.getState() });
    }
    async getState() {
        const configuration = vscode.workspace.getConfiguration('vcVeTools');
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const enabled = configuration.get(constants_1.mcpEnabledSetting, true);
        const role = (0, projectDatabaseOptions_1.getDatabaseRole)();
        const clientCredentials = await this.getClientCredentials();
        let databaseProfiles = [];
        let rdboadmPath;
        let rdboadmError;
        if (workspace) {
            try {
                const result = await (0, rdboadmIni_1.loadRdboadmDatabases)(workspace.uri.fsPath);
                databaseProfiles = result.databases;
                rdboadmPath = result.path;
            }
            catch (error) {
                rdboadmError = error instanceof Error ? error.message : String(error);
            }
        }
        const configuredProfile = configuration.get(constants_1.databaseProfileSetting, '');
        const databaseProfile = databaseProfiles.some(item => item.id === configuredProfile) ? configuredProfile : (databaseProfiles[0]?.id ?? '');
        const lastError = this.logger.getLastError();
        let status = enabled ? 'ready' : 'disabled';
        let statusText = enabled ? 'Готов к запуску агентом' : 'MCP-сервер выключен';
        if (enabled && !workspace) {
            status = 'unavailable';
            statusText = 'Откройте папку проекта';
        }
        else if (enabled && workspace) {
            try {
                if (databaseProfiles.length === 0) {
                    await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspace.uri, 'Vars.bat'));
                }
                await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.extensionUri, 'dist', 'mcp-server.js'));
            }
            catch {
                status = 'unavailable';
                statusText = 'Не найден rdboadm.ini/Vars.bat или сборка MCP-сервера';
            }
        }
        return {
            useFolderAsProjectRoot: configuration.get(constants_1.projectRootSetting, false),
            databaseRole: role,
            databaseProfile,
            databaseProfiles,
            rdboadmPath,
            rdboadmError,
            userId: configuration.get('userId', 0),
            clientUsername: clientCredentials.username ?? '',
            clientPasswordSet: Boolean(clientCredentials.password),
            mcpEnabled: enabled,
            mcpStatus: status,
            mcpStatusText: statusText,
            mcpConnectionCode: this.connectionCode(workspace?.uri.fsPath, role, databaseProfile),
            lastExtensionError: lastError && { timestamp: lastError.timestamp, source: lastError.source, message: lastError.message },
        };
    }
    connectionCode(workspacePath, role, profile) {
        const navigation = this.getNavigationConnection();
        return JSON.stringify({
            mcpServers: {
                'vc-ve-tools': {
                    command: 'node',
                    args: [
                        vscode.Uri.joinPath(this.extensionUri, 'dist', 'mcp-server.js').fsPath,
                        '--workspace', workspacePath ?? '<PROJECT_PATH>',
                        '--database-role', role,
                        ...(profile ? ['--database-profile', profile] : []),
                        ...(this.databaseSelectionPath ? ['--database-selection', this.databaseSelectionPath] : []),
                        '--logs', this.logger.logUri.fsPath,
                        ...(navigation ? ['--navigation-info', navigation.infoPath] : []),
                    ],
                },
            },
        }, null, 2);
    }
    post(message) {
        void this.panel?.webview.postMessage(message);
    }
    getHtml(webview, assetsRoot) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'settings.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'settings.css'));
        const nonce = createNonce();
        return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Настройки</title></head><body><div id="app"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
    }
}
exports.SettingsViewProvider = SettingsViewProvider;
function createNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
//# sourceMappingURL=settingsViewProvider.js.map