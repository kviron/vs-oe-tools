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
const assets_1 = require("../../infrastructure/webview/assets");
const vscode = __importStar(require("vscode"));
const constants_1 = require("../../core/constants");
const constants_2 = require("../../core/constants");
const webviewProtocol_1 = require("../../core/webviewProtocol");
const projectDatabaseOptions_1 = require("../../infrastructure/configuration/projectDatabaseOptions");
const classRepository_1 = require("../../infrastructure/database/classRepository");
const connectionStatus_1 = require("../../mcp/knowledge/connectionStatus");
const rdboadmIni_1 = require("../../infrastructure/configuration/rdboadmIni");
const tools_1 = require("../../mcp/tools");
const clientMcpService_1 = require("./clientMcpService");
class SettingsViewProvider {
    extensionUri;
    project;
    logger;
    getClientCredentials;
    setClientCredentials;
    secrets;
    panel;
    httpApiPanel;
    clientMcpStatusTimer;
    clientMcp;
    knowledgeMcpStatusCache;
    httpApi;
    disposables = [];
    constructor(extensionUri, project, services, logger, getClientCredentials = async () => ({}), setClientCredentials = async () => undefined, secrets) {
        this.extensionUri = extensionUri;
        this.project = project;
        this.logger = logger;
        this.getClientCredentials = getClientCredentials;
        this.setClientCredentials = setClientCredentials;
        this.secrets = secrets;
        this.clientMcp = services.clientMcp;
        this.httpApi = services.httpApi;
        this.disposables.push(this.logger.onDidChange(() => void this.postState()), vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('vcVeTools')) {
                void this.postState();
            }
            if (event.affectsConfiguration(`vcVeTools.${constants_2.databaseProfileSetting}`)
                || event.affectsConfiguration(`vcVeTools.${constants_2.databaseRoleSetting}`)) {
                this.clientMcp.scheduleDatabaseSync(action => this.setClientMcpServerRunning(action));
            }
        }), vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()));
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active);
            void this.postState();
            return;
        }
        const assetsRoot = (0, assets_1.getWebviewAssetsRoot)(this.extensionUri, 'settings');
        const panel = vscode.window.createWebviewPanel('vc-ve-tools.settings', 'Настройки Восточного Экспресса', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [assetsRoot],
        });
        this.panel = panel;
        panel.webview.html = this.getHtml(panel.webview, assetsRoot);
        panel.webview.onDidReceiveMessage(message => void this.handleMessage(message));
        panel.onDidChangeViewState(event => {
            if (event.webviewPanel.visible) {
                void this.postState();
            }
        });
        this.clientMcpStatusTimer = setInterval(() => {
            if (this.panel?.visible) {
                void this.postState();
            }
        }, 10_000);
        panel.onDidDispose(() => {
            this.panel = undefined;
            if (this.clientMcpStatusTimer) {
                clearInterval(this.clientMcpStatusTimer);
            }
            this.clientMcpStatusTimer = undefined;
        });
    }
    showHttpApi() {
        if (this.httpApiPanel) {
            this.httpApiPanel.reveal(vscode.ViewColumn.Active);
            void this.postState();
            return;
        }
        const assetsRoot = (0, assets_1.getWebviewAssetsRoot)(this.extensionUri, 'http-api');
        const panel = vscode.window.createWebviewPanel('vc-ve-tools.httpApi', 'HTTP API Восточного Экспресса', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [assetsRoot],
        });
        this.httpApiPanel = panel;
        panel.webview.html = this.getHtml(panel.webview, assetsRoot, 'http-api', 'HTTP API');
        panel.webview.onDidReceiveMessage(message => void this.handleMessage(message));
        panel.onDidChangeViewState(event => {
            if (event.webviewPanel.visible) {
                void this.postState();
            }
        });
        panel.onDidDispose(() => { this.httpApiPanel = undefined; });
    }
    refresh() {
        void this.postState();
    }
    async startHttpTestServer(methodName) {
        await this.httpApi.start(methodName);
        await this.postState();
        return this.httpApi.getServerState();
    }
    async stopHttpTestServer() {
        const state = await this.httpApi.stop();
        await this.postState();
        return state;
    }
    callHttpTestServer(request) {
        return this.httpApi.callServer(request);
    }
    callDirectHttpMethod(input) {
        return this.httpApi.callDirect(input);
    }
    getHttpTestServerState() {
        return this.httpApi.getServerState();
    }
    dispose() {
        if (this.clientMcpStatusTimer) {
            clearInterval(this.clientMcpStatusTimer);
        }
        this.panel?.dispose();
        this.httpApiPanel?.dispose();
        void this.httpApi.dispose().catch(error => this.logger.error('HTTP API', 'Не удалось остановить тестовый сервер.', error));
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
            await this.project.setProjectRootEnabled(message.enabled);
        }
        else if (message.command === 'setDatabaseRole') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_2.databaseRoleSetting, message.role, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'setDatabaseProfile') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_2.databaseProfileSetting, message.profile, vscode.ConfigurationTarget.Workspace);
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
                    await this.project.updateDatabase(message.role);
                }
                else if (message.action === 'startClient') {
                    await this.project.startClient(message.role);
                }
                else if (message.action === 'updatePackages') {
                    await this.project.updatePackages();
                }
                else {
                    await this.project.updateBinaries();
                }
            }
            catch (error) {
                void vscode.window.showErrorMessage(`Не удалось выполнить команду проекта: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else if (message.command === 'setUserId') {
            await vscode.workspace.getConfiguration('vcVeTools').update('userId', message.userId, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'setProductionTaskSource') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_1.productionTaskSourceSetting, message.value, vscode.ConfigurationTarget.Global);
            await this.postState();
        }
        else if (message.command === 'setProductionMcpToken') {
            try {
                if (!this.secrets) {
                    throw new Error('SecretStorage unavailable');
                }
                const token = message.value.trim();
                if (token) {
                    await this.secrets.store(constants_1.productionMcpTokenSecretKey, token);
                }
                else {
                    await this.secrets.delete(constants_1.productionMcpTokenSecretKey);
                }
                this.post({ command: 'productionMcpTokenSaved', success: true });
                await this.postState();
            }
            catch {
                this.post({ command: 'productionMcpTokenSaved', success: false });
            }
        }
        else if (message.command === 'setClientCredentials') {
            await this.setClientCredentials({ username: message.username, password: message.password });
            void vscode.window.showInformationMessage('Данные входа клиента ВЭ сохранены.');
            await this.postState();
        }
        else if (message.command === 'setClientLaunchArguments') {
            try {
                this.project.validateClientLaunchArguments(message.value);
                await vscode.workspace.getConfiguration('vcVeTools').update(constants_2.clientLaunchArgumentsSetting, message.value.trim(), vscode.ConfigurationTarget.Workspace);
                void vscode.window.showInformationMessage('Дополнительные параметры запуска клиента сохранены.');
                await this.postState();
            }
            catch (error) {
                void vscode.window.showErrorMessage(`Не удалось сохранить параметры запуска: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else if (message.command === 'setMcpEnabled') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_2.mcpEnabledSetting, message.enabled, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'setClientMcpPreferIPv4') {
            await vscode.workspace.getConfiguration('vcVeTools').update(constants_2.clientMcpPreferIPv4Setting, message.enabled, vscode.ConfigurationTarget.Workspace);
        }
        else if (message.command === 'refreshClientMcpStatus') {
            await this.postState();
        }
        else if (message.command === 'refreshKnowledgeMcpStatus') {
            this.knowledgeMcpStatusCache = undefined;
            await this.postState();
        }
        else if (message.command === 'selectKnowledgeMcpEnvFile') {
            const selected = await vscode.window.showOpenDialog({
                canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                openLabel: 'Выбрать .env базы знаний',
            });
            if (selected?.[0]) {
                await vscode.workspace.getConfiguration('vcVeTools').update(constants_2.knowledgeMcpEnvFileSetting, selected[0].fsPath, vscode.ConfigurationTarget.Global);
                this.knowledgeMcpStatusCache = undefined;
                await this.postState();
            }
        }
        else if (message.command === 'checkClientMcpTools') {
            await this.checkClientMcpTools();
        }
        else if (message.command === 'startClientMcpServer') {
            await this.setClientMcpServerRunning('start');
        }
        else if (message.command === 'stopClientMcpServer') {
            await this.setClientMcpServerRunning('stop');
        }
        else if (message.command === 'executeDirectHttpMethod') {
            this.post({ command: 'httpApiRequestStarted' });
            try {
                const response = await this.callDirectHttpMethod(message);
                this.post({ command: 'httpApiRequestFinished', success: true, response });
            }
            catch (error) {
                this.post({ command: 'httpApiRequestFinished', success: false, message: error instanceof Error ? error.message : String(error) });
            }
        }
        else if (message.command === 'executeHttpApiRequest') {
            this.post({ command: 'httpApiRequestStarted' });
            try {
                const response = await this.httpApi.executeRequest(message);
                this.post({ command: 'httpApiRequestFinished', success: true, response });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warning('HTTP API', `Запрос ${message.method} ${message.url} завершился ошибкой.`, error);
                this.post({ command: 'httpApiRequestFinished', success: false, message: errorMessage });
            }
        }
        else if (message.command === 'startHttpTestServer') {
            await this.setHttpTestServerRunning('start', message.methodName);
        }
        else if (message.command === 'stopHttpTestServer') {
            await this.setHttpTestServerRunning('stop');
        }
        else if (message.command === 'searchHttpParameterValues') {
            const values = await this.httpApi.searchParameterValues(message.typeName, message.query);
            this.post({ command: 'httpParameterValuesLoaded', parameter: message.parameter, query: message.query, values });
        }
        else if (message.command === 'copyHttpApiRequest') {
            await vscode.env.clipboard.writeText(message.text);
            vscode.window.setStatusBarMessage(message.notification ?? 'Запрос cURL скопирован — вставьте его в Import → Raw text в Postman', 5000);
        }
        else if (message.command === 'saveHttpApiResponse') {
            const extension = message.fileName.split('.').pop()?.toLocaleLowerCase('en') ?? 'txt';
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(message.fileName),
                filters: { 'Ответ HTTP API': [extension] },
                saveLabel: 'Сохранить ответ',
            });
            if (uri) {
                try {
                    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(message.text));
                    void vscode.window.showInformationMessage(`Ответ HTTP API сохранён: ${uri.fsPath}`);
                }
                catch (error) {
                    void vscode.window.showErrorMessage(`Не удалось сохранить ответ HTTP API: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        else if (message.command === 'openDatabaseObjectById') {
            await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', message.id, message.target ?? 'object');
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
    async setClientMcpServerRunning(action) {
        try {
            const result = await this.clientMcp.changeRunning(action, () => this.post({ command: 'clientMcpActionStarted', action }));
            if (result.changed && result.message) {
                this.post({ command: 'clientMcpActionFinished', action, success: true, message: result.message });
                void vscode.window.showInformationMessage(result.message);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.post({ command: 'clientMcpActionFinished', action, success: false, message });
            void vscode.window.showErrorMessage(`Не удалось ${action === 'start' ? 'запустить' : 'остановить'} клиентский MCP: ${message}`);
        }
        await this.postState();
    }
    async checkClientMcpTools() {
        this.post({ command: 'clientMcpToolsCheckStarted' });
        this.knowledgeMcpStatusCache = undefined;
        try {
            await this.clientMcp.refreshTools(true);
            this.post({ command: 'clientMcpToolsCheckFinished', success: true });
        }
        catch (error) {
            this.clientMcp.recordToolsError(error);
            this.post({ command: 'clientMcpToolsCheckFinished', success: false });
        }
        await this.postState();
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
    async setHttpTestServerRunning(action, methodName) {
        this.post({ command: 'httpTestServerActionStarted', action });
        try {
            if (action === 'stop') {
                await this.stopHttpTestServer();
            }
            else {
                if (!methodName) {
                    throw new Error('Выберите конкретный HTTP-метод перед запуском сервера.');
                }
                await this.startHttpTestServer(methodName);
            }
            const message = action === 'start'
                ? `Тестовый сервер метода ${this.httpApi.server?.methodName} запущен: ${this.httpApi.server?.url}`
                : 'Тестовый HTTP-сервер остановлен.';
            this.post({ command: 'httpTestServerActionFinished', action, success: true, message });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('HTTP API', `Не удалось ${action === 'start' ? 'запустить' : 'остановить'} тестовый сервер.`, error);
            await this.postState();
            this.post({ command: 'httpTestServerActionFinished', action, success: false, message });
        }
    }
    async postState() {
        if (!this.panel && !this.httpApiPanel) {
            return;
        }
        this.post({ command: 'settingsState', state: await this.getState() });
    }
    async getState() {
        this.httpApi.getServerState();
        const httpTestServer = this.httpApi.server;
        const configuration = vscode.workspace.getConfiguration('vcVeTools');
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const enabled = configuration.get(constants_2.mcpEnabledSetting, true);
        const clientMcpUrl = (0, clientMcpService_1.configuredClientMcpUrl)();
        const knowledgeMcpEnvFile = configuration.get(constants_2.knowledgeMcpEnvFileSetting, '');
        const knowledgeMcpStatus = await this.getKnowledgeMcpStatus(workspace?.uri.fsPath, knowledgeMcpEnvFile);
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
        const configuredProfile = configuration.get(constants_2.databaseProfileSetting, '');
        const databaseProfile = databaseProfiles.some(item => item.id === configuredProfile) ? configuredProfile : (databaseProfiles[0]?.id ?? '');
        const lastError = this.logger.getLastError();
        await this.httpApi.loadMethodsForState();
        const clientMcpStatus = await this.clientMcp.getStatus();
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
            useFolderAsProjectRoot: configuration.get(constants_2.projectRootSetting, false),
            databaseRole: role,
            databaseProfile,
            databaseProfiles,
            rdboadmPath,
            rdboadmError,
            userId: configuration.get('userId', 0),
            clientUsername: clientCredentials.username ?? '',
            clientPasswordSet: Boolean(clientCredentials.password),
            productionMcpTokenSet: Boolean(await this.secrets?.get(constants_1.productionMcpTokenSecretKey)),
            productionTaskSource: configuration.get(constants_1.productionTaskSourceSetting, 'oenp'),
            clientLaunchArguments: configuration.get(constants_2.clientLaunchArgumentsSetting, ''),
            mcpEnabled: enabled,
            mcpStatus: status,
            mcpStatusText: statusText,
            knowledgeMcpStatus,
            knowledgeMcpEnvFile,
            clientMcpUrl,
            clientMcpPreferIPv4: configuration.get(constants_2.clientMcpPreferIPv4Setting, false),
            ...clientMcpStatus,
            extensionMcpTools: (0, tools_1.getRegisteredToolCatalog)(),
            clientMcpTools: this.clientMcp.tools,
            knowledgeMcpTools: knowledgeMcpStatus.tools,
            clientMcpToolsDatabase: this.clientMcp.toolsDatabase,
            clientMcpToolsUpdatedAt: this.clientMcp.toolsUpdatedAt,
            clientMcpToolsError: this.clientMcp.toolsError,
            mcpConnectionCode: this.connectionCode(),
            lastExtensionError: lastError && { timestamp: lastError.timestamp, source: lastError.source, message: lastError.message },
            httpMethods: this.httpApi.methods,
            httpMethodsError: this.httpApi.methodsError,
            httpTestServer: httpTestServer && {
                methodName: httpTestServer.methodName,
                database: httpTestServer.database,
                url: httpTestServer.url,
                processId: httpTestServer.processId,
            },
        };
    }
    async getKnowledgeMcpStatus(workspacePath, configuredFile) {
        const cached = this.knowledgeMcpStatusCache;
        if (cached && Date.now() - cached.checkedAt < 30_000) {
            return cached.value;
        }
        const value = await (0, connectionStatus_1.checkKnowledgeMcpStatus)(this.extensionUri.fsPath, workspacePath, configuredFile);
        this.knowledgeMcpStatusCache = { checkedAt: Date.now(), value };
        return value;
    }
    connectionCode() {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const configuredFile = vscode.workspace.getConfiguration('vcVeTools').get(constants_2.knowledgeMcpEnvFileSetting, '').trim();
        return JSON.stringify({
            mcpServers: {
                'vc-ve-tools': {
                    command: 'node',
                    args: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'mcp-server.js').fsPath,
                        ...(workspacePath ? ['--workspace', workspacePath] : []),
                        ...(configuredFile ? ['--knowledge-env-file', configuredFile] : [])],
                },
            },
        }, null, 2);
    }
    post(message) {
        void this.panel?.webview.postMessage(message);
        void this.httpApiPanel?.webview.postMessage(message);
    }
    getHtml(webview, assetsRoot, entry = 'settings', title = 'Настройки') {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, `${entry}.js`));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
        const nonce = createNonce();
        return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csp-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>${title}</title></head><body><div id="app"></div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
    }
}
exports.SettingsViewProvider = SettingsViewProvider;
function createNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
//# sourceMappingURL=settingsViewProvider.js.map