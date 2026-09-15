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
const clientMcpHttp_1 = require("../../mcp/clientMcpHttp");
const oeStaticMethodExecutor_1 = require("../lifecycle/oeStaticMethodExecutor");
const rdboadmIni_1 = require("../../infrastructure/configuration/rdboadmIni");
const projectCommandService_1 = require("../project/projectCommandService");
const tools_1 = require("../../mcp/tools");
const httpApiRequest_1 = require("../http-api/httpApiRequest");
const httpServerLifecycle_1 = require("../http-api/httpServerLifecycle");
const directHttpMethod_1 = require("../http-api/directHttpMethod");
const httpMethodRepository_1 = require("../http-api/httpMethodRepository");
class SettingsViewProvider {
    extensionUri;
    setProjectRootEnabled;
    logger;
    getNavigationConnection;
    databaseSelectionPath;
    getClientCredentials;
    setClientCredentials;
    workspaceState;
    static clientMcpToolsCacheKey = 'vcVeTools.clientMcpTools.v1';
    panel;
    httpApiPanel;
    clientMcpStatusTimer;
    clientMcpDatabaseSync;
    clientMcpTools;
    clientMcpToolsDatabase;
    clientMcpToolsUpdatedAt;
    clientMcpToolsError;
    httpMethods = [];
    httpMethodsError;
    httpServerLifecycle = new httpServerLifecycle_1.HttpServerLifecycle();
    directRequestController;
    get httpTestServer() { return this.httpServerLifecycle.server; }
    set httpTestServer(server) { this.httpServerLifecycle.server = server; }
    disposables = [];
    constructor(extensionUri, setProjectRootEnabled, logger, getNavigationConnection, databaseSelectionPath, getClientCredentials = async () => ({}), setClientCredentials = async () => undefined, workspaceState) {
        this.extensionUri = extensionUri;
        this.setProjectRootEnabled = setProjectRootEnabled;
        this.logger = logger;
        this.getNavigationConnection = getNavigationConnection;
        this.databaseSelectionPath = databaseSelectionPath;
        this.getClientCredentials = getClientCredentials;
        this.setClientCredentials = setClientCredentials;
        this.workspaceState = workspaceState;
        const cachedTools = this.workspaceState?.get(SettingsViewProvider.clientMcpToolsCacheKey);
        if (cachedTools) {
            this.clientMcpTools = cachedTools.tools;
            this.clientMcpToolsDatabase = cachedTools.database;
            this.clientMcpToolsUpdatedAt = cachedTools.updatedAt;
        }
        this.disposables.push(this.logger.onDidChange(() => void this.postState()), vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('vcVeTools')) {
                void this.postState();
            }
            if (event.affectsConfiguration(`vcVeTools.${constants_1.databaseProfileSetting}`)
                || event.affectsConfiguration(`vcVeTools.${constants_1.databaseRoleSetting}`)) {
                this.scheduleClientMcpDatabaseSync();
            }
        }), vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()));
    }
    refreshClientMcpToolsOnActivation() {
        void this.refreshClientMcpTools(true).catch(error => {
            this.clientMcpToolsError = error instanceof Error ? error.message : String(error);
            this.logger.warning('MCP client', 'Не удалось обновить каталог инструментов при активации расширения.', error);
            void this.postState();
        });
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
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
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
        await this.httpServerLifecycle.replace(async () => {
            await this.refreshHttpMethods();
            const selected = this.httpMethods.find(item => item.name === methodName);
            if (!selected) {
                throw new Error('Выбранный HTTP-метод не найден в текущей базе.');
            }
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                throw new Error('Сначала откройте папку проекта Восточного Экспресса.');
            }
            const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
            return (0, oeStaticMethodExecutor_1.startHttpTestServerProcess)(workspacePath, selected.name, options.database, options.host, await this.getClientCredentials());
        });
        await this.postState();
        return this.getHttpTestServerState();
    }
    async stopHttpTestServer() {
        await this.httpServerLifecycle.replace();
        await this.postState();
        return { running: false };
    }
    async callHttpTestServer(request) {
        const server = this.httpTestServer;
        if (!server || !server.isRunning()) {
            throw new Error('Тестовый HTTP-сервер не запущен.');
        }
        const state = this.getHttpTestServerState();
        const url = new URL(server.url);
        url.searchParams.set('method', request.methodName?.trim() || server.methodName);
        const response = await (0, httpApiRequest_1.executeHttpApiRequest)({
            method: typeof request.method === 'string' && request.method.trim() ? request.method : 'GET',
            url: url.toString(), headers: request.headers ?? {}, body: request.body,
        });
        return { server: state, response };
    }
    async callDirectHttpMethod(input) {
        if (this.directRequestController) {
            throw new Error('Предыдущий прямой вызов ещё выполняется.');
        }
        const request = (0, directHttpMethod_1.validateDirectHttpMethodRequest)(input);
        const controller = new AbortController();
        this.directRequestController = controller;
        try {
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                throw new Error('Сначала откройте папку проекта Восточного Экспресса.');
            }
            const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
            const methods = await (0, httpMethodRepository_1.loadHttpMethods)();
            if (!methods.some(method => method.name === request.methodName)) {
                throw new Error('Метод не найден в каталоге текущей базы. Обновите список методов.');
            }
            return await (0, directHttpMethod_1.executeDirectHttpMethod)(workspacePath, request, options.database, options.host, await this.getClientCredentials(), controller.signal);
        }
        finally {
            this.directRequestController = undefined;
        }
    }
    getHttpTestServerState() {
        if (this.httpTestServer && !this.httpTestServer.isRunning()) {
            this.httpTestServer = undefined;
        }
        return this.httpTestServer ? {
            running: true,
            methodName: this.httpTestServer.methodName,
            database: this.httpTestServer.database,
            url: this.httpTestServer.url,
            processId: this.httpTestServer.processId,
        } : { running: false };
    }
    async refreshHttpMethods() {
        this.httpMethods = await (0, httpMethodRepository_1.loadHttpMethods)();
        this.httpMethodsError = undefined;
    }
    dispose() {
        this.directRequestController?.abort();
        if (this.clientMcpStatusTimer) {
            clearInterval(this.clientMcpStatusTimer);
        }
        this.panel?.dispose();
        this.httpApiPanel?.dispose();
        void this.httpServerLifecycle.replace().catch(error => this.logger.error('HTTP API', 'Не удалось остановить тестовый сервер.', error));
        this.disposables.forEach(disposable => disposable.dispose());
    }
    scheduleClientMcpDatabaseSync() {
        if (this.clientMcpDatabaseSync) {
            return;
        }
        this.clientMcpDatabaseSync = this.syncClientMcpDatabase()
            .then(() => this.refreshClientMcpTools(true))
            .catch(error => this.logger.error('Настройки', 'Не удалось переключить базу клиентского MCP', error))
            .finally(() => { this.clientMcpDatabaseSync = undefined; });
    }
    async syncClientMcpDatabase() {
        const clientMcpUrl = getConfiguredClientMcpUrl(vscode.workspace.getConfiguration('vcVeTools'));
        const selectedDatabase = (await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)()).database;
        try {
            const health = await (0, clientMcpHttp_1.getClientMcpHealth)(clientMcpUrl);
            if (health.status.toLocaleLowerCase('en') === 'ok'
                && health.database?.toLocaleLowerCase('en') !== selectedDatabase.toLocaleLowerCase('en')) {
                await this.setClientMcpServerRunning('stop');
                await this.setClientMcpServerRunning('start');
            }
        }
        catch {
            // An offline client MCP does not need database synchronization.
        }
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
                else if (message.action === 'startClient') {
                    await (0, projectCommandService_1.startProjectClient)(message.role, await this.getClientCredentials());
                }
                else if (message.action === 'updatePackages') {
                    await (0, projectCommandService_1.updateProjectPackages)();
                }
                else {
                    await (0, projectCommandService_1.updateProjectBinaries)();
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
        else if (message.command === 'refreshClientMcpStatus') {
            await this.postState();
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
                const response = await (0, httpApiRequest_1.executeHttpApiRequest)(message);
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
            const values = await (0, httpMethodRepository_1.searchHttpParameterValues)(message.typeName, message.query);
            this.post({ command: 'httpParameterValuesLoaded', parameter: message.parameter, query: message.query, values });
        }
        else if (message.command === 'copyHttpApiRequest') {
            await vscode.env.clipboard.writeText(message.text);
            vscode.window.setStatusBarMessage(message.notification ?? 'Запрос cURL скопирован — вставьте его в Import → Raw text в Postman', 5000);
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
        const configuration = vscode.workspace.getConfiguration('vcVeTools');
        const clientMcpUrl = getConfiguredClientMcpUrl(configuration);
        let currentlyOnline = false;
        try {
            const health = await (0, clientMcpHttp_1.getClientMcpHealth)(clientMcpUrl);
            currentlyOnline = health.status.toLocaleLowerCase('en') === 'ok';
        }
        catch {
            currentlyOnline = false;
        }
        if ((action === 'start' && currentlyOnline) || (action === 'stop' && !currentlyOnline)) {
            await this.postState();
            return;
        }
        this.post({ command: 'clientMcpActionStarted', action });
        try {
            let database = '';
            if (action === 'start') {
                const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspacePath) {
                    throw new Error('Сначала откройте папку проекта Восточного Экспресса.');
                }
                const databaseOptions = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
                database = databaseOptions.database;
                await (0, oeStaticMethodExecutor_1.startClientMcpProcess)(workspacePath, databaseOptions.database, databaseOptions.host, await this.getClientCredentials());
            }
            else {
                await (0, clientMcpHttp_1.stopClientMcpServer)(clientMcpUrl);
            }
            let targetStateReached = false;
            for (let attempt = 0; attempt < 10; attempt += 1) {
                try {
                    const health = await (0, clientMcpHttp_1.getClientMcpHealth)(clientMcpUrl);
                    targetStateReached = action === 'start' && health.status.toLocaleLowerCase('en') === 'ok';
                }
                catch {
                    targetStateReached = action === 'stop';
                }
                if (targetStateReached) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (!targetStateReached) {
                const statusUrl = `${clientMcpUrl}/health`;
                throw new Error(action === 'start'
                    ? `Метод выполнен, но ${statusUrl} не ответил со статусом ok.`
                    : `Метод выполнен, но ${statusUrl} продолжает отвечать.`);
            }
            if (action === 'start') {
                try {
                    await this.loadClientMcpTools(clientMcpUrl, database);
                }
                catch (error) {
                    this.clientMcpTools = undefined;
                    this.clientMcpToolsError = error instanceof Error ? error.message : String(error);
                }
            }
            else {
                this.clientMcpTools = undefined;
                this.clientMcpToolsError = undefined;
            }
            const methodName = action === 'start' ? 'aiMCP.http_Start' : 'aiMCP.http_Stop';
            const methodId = oeStaticMethodExecutor_1.clientMcpMethodIds[action];
            const actionText = action === 'start' ? 'запущен' : 'остановлен';
            const toolsText = action === 'start' && this.clientMcpToolsError ? ' Проверка списка инструментов завершилась ошибкой.' : '';
            const message = `Клиентский MCP ${actionText} через ${methodName} (ID ${methodId})${database ? ' в базе ' + database : ''}.${toolsText}`;
            this.post({ command: 'clientMcpActionFinished', action, success: true, message });
            void vscode.window.showInformationMessage(message);
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
        try {
            await this.refreshClientMcpTools(true);
            this.post({ command: 'clientMcpToolsCheckFinished', success: true });
        }
        catch (error) {
            this.clientMcpTools = undefined;
            this.clientMcpToolsError = error instanceof Error ? error.message : String(error);
            this.post({ command: 'clientMcpToolsCheckFinished', success: false });
        }
        await this.postState();
    }
    async refreshClientMcpTools(stopAfterTemporaryStart) {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) {
            throw new Error('Сначала откройте папку проекта Восточного Экспресса.');
        }
        const clientMcpUrl = getConfiguredClientMcpUrl(vscode.workspace.getConfiguration('vcVeTools'));
        const databaseOptions = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
        let startedTemporarily = false;
        let health;
        try {
            try {
                health = await (0, clientMcpHttp_1.getClientMcpHealth)(clientMcpUrl);
            }
            catch {
                health = undefined;
            }
            const wasOnline = health?.status.toLocaleLowerCase('en') === 'ok';
            const onlineForSelectedDatabase = wasOnline
                && health?.database?.toLocaleLowerCase('en') === databaseOptions.database.toLocaleLowerCase('en');
            if (!onlineForSelectedDatabase) {
                if (health?.status.toLocaleLowerCase('en') === 'ok') {
                    await (0, clientMcpHttp_1.stopClientMcpServer)(clientMcpUrl);
                }
                startedTemporarily = stopAfterTemporaryStart && !wasOnline;
                await (0, oeStaticMethodExecutor_1.startClientMcpProcess)(workspacePath, databaseOptions.database, databaseOptions.host, await this.getClientCredentials());
                await this.waitForClientMcp(clientMcpUrl, databaseOptions.database);
            }
            await this.loadClientMcpTools(clientMcpUrl, databaseOptions.database);
        }
        finally {
            if (startedTemporarily) {
                try {
                    await (0, clientMcpHttp_1.stopClientMcpServer)(clientMcpUrl);
                }
                catch (error) {
                    this.logger.warning('MCP client', 'Не удалось остановить временно запущенный MCP после чтения каталога.', error);
                }
            }
        }
    }
    async waitForClientMcp(clientMcpUrl, database) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            try {
                const health = await (0, clientMcpHttp_1.getClientMcpHealth)(clientMcpUrl);
                if (health.status.toLocaleLowerCase('en') === 'ok'
                    && health.database?.toLocaleLowerCase('en') === database.toLocaleLowerCase('en')) {
                    return;
                }
            }
            catch { /* The client can still be starting. */ }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error(`Клиентский MCP для базы ${database} не запустился.`);
    }
    async loadClientMcpTools(clientMcpUrl, database) {
        const tools = await (0, clientMcpHttp_1.listClientMcpTools)(clientMcpUrl);
        this.clientMcpTools = tools
            .map(tool => ({ name: tool.name, description: tool.description.trim() }))
            .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
        this.clientMcpToolsDatabase = database;
        this.clientMcpToolsUpdatedAt = new Date().toISOString();
        this.clientMcpToolsError = undefined;
        if (database && this.workspaceState) {
            await this.workspaceState.update(SettingsViewProvider.clientMcpToolsCacheKey, {
                database,
                updatedAt: this.clientMcpToolsUpdatedAt,
                tools: this.clientMcpTools,
            });
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
                ? `Тестовый сервер метода ${this.httpTestServer?.methodName} запущен: ${this.httpTestServer?.url}`
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
        if (this.httpTestServer && !this.httpTestServer.isRunning()) {
            this.httpTestServer = undefined;
        }
        const configuration = vscode.workspace.getConfiguration('vcVeTools');
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const enabled = configuration.get(constants_1.mcpEnabledSetting, true);
        const clientMcpUrl = getConfiguredClientMcpUrl(configuration);
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
        try {
            this.httpMethods = await (0, httpMethodRepository_1.loadHttpMethods)();
            this.httpMethodsError = undefined;
        }
        catch (error) {
            this.httpMethods = [];
            this.httpMethodsError = error instanceof Error ? error.message : String(error);
        }
        let clientMcpStatus = 'offline';
        let clientMcpStatusText = 'Нет связи';
        let clientMcpDatabase;
        let selectedDatabase;
        try {
            selectedDatabase = (await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)()).database;
        }
        catch {
            selectedDatabase = undefined;
        }
        try {
            const health = await (0, clientMcpHttp_1.getClientMcpHealth)(clientMcpUrl);
            clientMcpDatabase = health.database?.trim() || undefined;
            if (health.status.toLocaleLowerCase('en') === 'ok') {
                clientMcpStatus = 'online';
                clientMcpStatusText = clientMcpDatabase ? `Работает · ${clientMcpDatabase}` : 'Работает';
            }
            else {
                clientMcpStatusText = `Статус: ${health.status}`;
            }
        }
        catch {
            // The offline state is expected when the original client is not running.
        }
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
            clientMcpUrl,
            clientMcpStatus,
            clientMcpStatusText,
            clientMcpDatabase,
            clientMcpDatabaseMatchesSelection: clientMcpDatabase && selectedDatabase
                ? clientMcpDatabase.toLocaleLowerCase('en') === selectedDatabase.toLocaleLowerCase('en')
                : undefined,
            extensionMcpTools: (0, tools_1.getRegisteredToolCatalog)(),
            clientMcpTools: this.clientMcpTools,
            clientMcpToolsDatabase: this.clientMcpToolsDatabase,
            clientMcpToolsUpdatedAt: this.clientMcpToolsUpdatedAt,
            clientMcpToolsError: this.clientMcpToolsError,
            mcpConnectionCode: this.connectionCode(workspace?.uri.fsPath, role, databaseProfile, clientMcpUrl),
            lastExtensionError: lastError && { timestamp: lastError.timestamp, source: lastError.source, message: lastError.message },
            httpMethods: this.httpMethods,
            httpMethodsError: this.httpMethodsError,
            httpTestServer: this.httpTestServer && {
                methodName: this.httpTestServer.methodName,
                database: this.httpTestServer.database,
                url: this.httpTestServer.url,
                processId: this.httpTestServer.processId,
            },
        };
    }
    connectionCode(workspacePath, role, profile, clientMcpUrl) {
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
                        '--client-mcp-url', clientMcpUrl,
                        '--logs', this.logger.logUri.fsPath,
                        ...(navigation ? ['--navigation-info', navigation.infoPath] : []),
                    ],
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
function getConfiguredClientMcpUrl(configuration) {
    const configured = configuration.get(constants_1.clientMcpUrlSetting, 'http://localhost:8080').trim();
    if (/^http:\/\/(?:localhost|127\.0\.0\.1):8080\/mcp\/?$/iu.test(configured)) {
        return configured.replace(/\/mcp\/?$/iu, '');
    }
    return configured;
}
function createNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
//# sourceMappingURL=settingsViewProvider.js.map