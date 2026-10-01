import * as vscode from 'vscode';
import { clientLaunchArgumentsSetting, databaseProfileSetting, databaseRoleSetting, knowledgeMcpEnvFileSetting, mcpEnabledSetting, projectRootSetting } from '../../core/constants';
import type { SettingsHostMessage, SettingsState } from '../../core/webviewProtocol';
import { isSettingsWebviewMessage } from '../../core/webviewProtocol';
import { getDatabaseRole } from '../../infrastructure/configuration/projectDatabaseOptions';
import { testDatabaseConnection } from '../../infrastructure/database/classRepository';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import { checkKnowledgeMcpStatus, type KnowledgeMcpStatus } from '../../mcp/knowledge/connectionStatus';
import { loadRdboadmDatabases, saveRdboadmDatabase } from '../../infrastructure/configuration/rdboadmIni';
import type { ClientCredentials } from '../project';
import { getRegisteredToolCatalog } from '../../mcp/tools';
import type { HttpApiRequest } from '../http-api/httpApiRequest';
import type { DirectHttpMethodRequest } from '../http-api/directHttpMethod';
import type { SettingsServices, SettingsProjectActions } from './contracts';
import { configuredClientMcpUrl } from './clientMcpService';

export class SettingsViewProvider implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private httpApiPanel?: vscode.WebviewPanel;
	private clientMcpStatusTimer?: ReturnType<typeof setInterval>;
	private readonly clientMcp: SettingsServices['clientMcp'];
	private knowledgeMcpStatusCache?: { checkedAt: number; value: KnowledgeMcpStatus };
	private readonly httpApi: SettingsServices['httpApi'];
	private readonly disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly project: SettingsProjectActions,
		services: SettingsServices,
		private readonly logger: ExtensionLogService,
		private readonly getClientCredentials: () => Promise<ClientCredentials> = async () => ({}),
		private readonly setClientCredentials: (credentials: ClientCredentials) => Promise<void> = async () => undefined,
	) {
		this.clientMcp = services.clientMcp;
		this.httpApi = services.httpApi;
		this.disposables.push(
			this.logger.onDidChange(() => void this.postState()),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('vcVeTools')) {
					void this.postState();
				}
				if (event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)
					|| event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)) {
					this.clientMcp.scheduleDatabaseSync(action => this.setClientMcpServerRunning(action));
				}
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()),
		);
	}

	public show(): void {
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
			if (event.webviewPanel.visible) { void this.postState(); }
		});
		this.clientMcpStatusTimer = setInterval(() => {
			if (this.panel?.visible) { void this.postState(); }
		}, 10_000);
		panel.onDidDispose(() => {
			this.panel = undefined;
			if (this.clientMcpStatusTimer) { clearInterval(this.clientMcpStatusTimer); }
			this.clientMcpStatusTimer = undefined;
		});
	}

	public showHttpApi(): void {
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
			if (event.webviewPanel.visible) { void this.postState(); }
		});
		panel.onDidDispose(() => { this.httpApiPanel = undefined; });
	}

	public refresh(): void {
		void this.postState();
	}

	public async startHttpTestServer(methodName: string): Promise<Record<string, unknown>> {
		await this.httpApi.start(methodName);
		await this.postState();
		return this.httpApi.getServerState();
	}

	public async stopHttpTestServer(): Promise<Record<string, unknown>> {
		const state = await this.httpApi.stop();
		await this.postState();
		return state;
	}

	public callHttpTestServer(request: Omit<HttpApiRequest, 'url'> & { methodName?: string }): Promise<Record<string, unknown>> {
		return this.httpApi.callServer(request);
	}

	public callDirectHttpMethod(input: DirectHttpMethodRequest) {
		return this.httpApi.callDirect(input);
	}

	public getHttpTestServerState(): Record<string, unknown> {
		return this.httpApi.getServerState();
	}

	public dispose(): void {
		if (this.clientMcpStatusTimer) { clearInterval(this.clientMcpStatusTimer); }
		this.panel?.dispose();
		this.httpApiPanel?.dispose();
		void this.httpApi.dispose().catch(error => this.logger.error('HTTP API', 'Не удалось остановить тестовый сервер.', error));
		this.disposables.forEach(disposable => disposable.dispose());
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!isSettingsWebviewMessage(message)) {
			return;
		}
		if (message.command === 'settingsReady') {
			await this.postState();
		} else if (message.command === 'setProjectRootEnabled') {
			await this.project.setProjectRootEnabled(message.enabled);
		} else if (message.command === 'setDatabaseRole') {
			await vscode.workspace.getConfiguration('vcVeTools').update(databaseRoleSetting, message.role, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'setDatabaseProfile') {
			await vscode.workspace.getConfiguration('vcVeTools').update(databaseProfileSetting, message.profile, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'saveDatabaseProfile') {
			const workspace = vscode.workspace.workspaceFolders?.[0];
			if (!workspace) { throw new Error('Сначала откройте папку проекта.'); }
			try {
				await saveRdboadmDatabase(workspace.uri.fsPath, { id: message.profile, name: message.profile, fields: message.fields });
				void vscode.window.showInformationMessage(`Настройки базы [${message.profile}] сохранены в rdboadm.ini.`);
				await this.postState();
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось сохранить rdboadm.ini: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else if (message.command === 'runProjectCommand') {
			try {
				if (message.action === 'updateDatabase') {
					await this.project.updateDatabase(message.role);
				} else if (message.action === 'startClient') {
					await this.project.startClient(message.role);
				} else if (message.action === 'updatePackages') {
					await this.project.updatePackages();
				} else {
					await this.project.updateBinaries();
				}
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось выполнить команду проекта: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else if (message.command === 'setUserId') {
			await vscode.workspace.getConfiguration('vcVeTools').update('userId', message.userId, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'setClientCredentials') {
			await this.setClientCredentials({ username: message.username, password: message.password });
			void vscode.window.showInformationMessage('Данные входа клиента ВЭ сохранены.');
			await this.postState();
		} else if (message.command === 'setClientLaunchArguments') {
			try {
				this.project.validateClientLaunchArguments(message.value);
				await vscode.workspace.getConfiguration('vcVeTools').update(clientLaunchArgumentsSetting, message.value.trim(), vscode.ConfigurationTarget.Workspace);
				void vscode.window.showInformationMessage('Дополнительные параметры запуска клиента сохранены.');
				await this.postState();
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось сохранить параметры запуска: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else if (message.command === 'setMcpEnabled') {
			await vscode.workspace.getConfiguration('vcVeTools').update(mcpEnabledSetting, message.enabled, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'refreshClientMcpStatus') {
			await this.postState();
		} else if (message.command === 'refreshKnowledgeMcpStatus') {
			this.knowledgeMcpStatusCache = undefined;
			await this.postState();
		} else if (message.command === 'selectKnowledgeMcpEnvFile') {
			const selected = await vscode.window.showOpenDialog({
				canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
				openLabel: 'Выбрать .env базы знаний',
			});
			if (selected?.[0]) {
				await vscode.workspace.getConfiguration('vcVeTools').update(knowledgeMcpEnvFileSetting, selected[0].fsPath, vscode.ConfigurationTarget.Global);
				this.knowledgeMcpStatusCache = undefined;
				await this.postState();
			}
		} else if (message.command === 'checkClientMcpTools') {
			await this.checkClientMcpTools();
		} else if (message.command === 'startClientMcpServer') {
			await this.setClientMcpServerRunning('start');
		} else if (message.command === 'stopClientMcpServer') {
			await this.setClientMcpServerRunning('stop');
		} else if (message.command === 'executeDirectHttpMethod') {
			this.post({ command: 'httpApiRequestStarted' });
			try {
				const response = await this.callDirectHttpMethod(message);
				this.post({ command: 'httpApiRequestFinished', success: true, response });
			} catch (error) {
				this.post({ command: 'httpApiRequestFinished', success: false, message: error instanceof Error ? error.message : String(error) });
			}
		} else if (message.command === 'executeHttpApiRequest') {
			this.post({ command: 'httpApiRequestStarted' });
			try {
				const response = await this.httpApi.executeRequest(message);
				this.post({ command: 'httpApiRequestFinished', success: true, response });
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logger.warning('HTTP API', `Запрос ${message.method} ${message.url} завершился ошибкой.`, error);
				this.post({ command: 'httpApiRequestFinished', success: false, message: errorMessage });
			}
		} else if (message.command === 'startHttpTestServer') {
			await this.setHttpTestServerRunning('start', message.methodName);
		} else if (message.command === 'stopHttpTestServer') {
			await this.setHttpTestServerRunning('stop');
		} else if (message.command === 'searchHttpParameterValues') {
			const values = await this.httpApi.searchParameterValues(message.typeName, message.query);
			this.post({ command: 'httpParameterValuesLoaded', parameter: message.parameter, query: message.query, values });
		} else if (message.command === 'copyHttpApiRequest') {
			await vscode.env.clipboard.writeText(message.text);
			vscode.window.setStatusBarMessage(message.notification ?? 'Запрос cURL скопирован — вставьте его в Import → Raw text в Postman', 5000);
		} else if (message.command === 'saveHttpApiResponse') {
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
				} catch (error) {
					void vscode.window.showErrorMessage(`Не удалось сохранить ответ HTTP API: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		} else if (message.command === 'openDatabaseObjectById') {
			await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', message.id, message.target ?? 'object');
		} else if (message.command === 'testSettingsDatabaseConnection') {
			await this.testConnection();
		} else if (message.command === 'clearExtensionLogs') {
			await this.logger.clear();
			await this.postState();
		} else {
			await vscode.env.clipboard.writeText(message.text);
			vscode.window.setStatusBarMessage('Код подключения MCP скопирован', 2500);
		}
	}

	private async setClientMcpServerRunning(action: 'start' | 'stop'): Promise<void> {
		try {
			const result = await this.clientMcp.changeRunning(action, () => this.post({ command: 'clientMcpActionStarted', action }));
			if (result.changed && result.message) {
				this.post({ command: 'clientMcpActionFinished', action, success: true, message: result.message });
				void vscode.window.showInformationMessage(result.message);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.post({ command: 'clientMcpActionFinished', action, success: false, message });
			void vscode.window.showErrorMessage(`Не удалось ${action === 'start' ? 'запустить' : 'остановить'} клиентский MCP: ${message}`);
		}
		await this.postState();
	}

	private async checkClientMcpTools(): Promise<void> {
		this.post({ command: 'clientMcpToolsCheckStarted' });
		this.knowledgeMcpStatusCache = undefined;
		try {
			await this.clientMcp.refreshTools(true);
			this.post({ command: 'clientMcpToolsCheckFinished', success: true });
		} catch (error) {
			this.clientMcp.recordToolsError(error);
			this.post({ command: 'clientMcpToolsCheckFinished', success: false });
		}
		await this.postState();
	}

	private async testConnection(): Promise<void> {
		this.post({ command: 'databaseConnectionTestStarted' });
		try {
			const result = await testDatabaseConnection();
			this.post({ command: 'databaseConnectionTestFinished', success: true, message: `Подключено: ${result.database}, пользователь ${result.user}.` });
		} catch (error) {
			this.logger.error('Настройки', 'Проверка подключения к базе завершилась ошибкой', error);
			this.post({ command: 'databaseConnectionTestFinished', success: false, message: error instanceof Error ? error.message : String(error) });
		}
	}

	private async setHttpTestServerRunning(action: 'start' | 'stop', methodName?: string): Promise<void> {
		this.post({ command: 'httpTestServerActionStarted', action });
		try {
			if (action === 'stop') {
				await this.stopHttpTestServer();
			} else {
				if (!methodName) { throw new Error('Выберите конкретный HTTP-метод перед запуском сервера.'); }
				await this.startHttpTestServer(methodName);
			}
			const message = action === 'start'
				? `Тестовый сервер метода ${this.httpApi.server?.methodName} запущен: ${this.httpApi.server?.url}`
				: 'Тестовый HTTP-сервер остановлен.';
			this.post({ command: 'httpTestServerActionFinished', action, success: true, message });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error('HTTP API', `Не удалось ${action === 'start' ? 'запустить' : 'остановить'} тестовый сервер.`, error);
			await this.postState();
			this.post({ command: 'httpTestServerActionFinished', action, success: false, message });
		}
	}

	private async postState(): Promise<void> {
		if (!this.panel && !this.httpApiPanel) {
			return;
		}
		this.post({ command: 'settingsState', state: await this.getState() });
	}

	private async getState(): Promise<SettingsState> {
		this.httpApi.getServerState();
		const httpTestServer = this.httpApi.server;
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const workspace = vscode.workspace.workspaceFolders?.[0];
		const enabled = configuration.get<boolean>(mcpEnabledSetting, true);
		const clientMcpUrl = configuredClientMcpUrl();
		const knowledgeMcpEnvFile = configuration.get<string>(knowledgeMcpEnvFileSetting, '');
		const knowledgeMcpStatus = await this.getKnowledgeMcpStatus(workspace?.uri.fsPath, knowledgeMcpEnvFile);
		const role = getDatabaseRole();
		const clientCredentials = await this.getClientCredentials();
		let databaseProfiles: SettingsState['databaseProfiles'] = [];
		let rdboadmPath: string | undefined;
		let rdboadmError: string | undefined;
		if (workspace) {
			try {
				const result = await loadRdboadmDatabases(workspace.uri.fsPath);
				databaseProfiles = result.databases;
				rdboadmPath = result.path;
			} catch (error) {
				rdboadmError = error instanceof Error ? error.message : String(error);
			}
		}
		const configuredProfile = configuration.get<string>(databaseProfileSetting, '');
		const databaseProfile = databaseProfiles.some(item => item.id === configuredProfile) ? configuredProfile : (databaseProfiles[0]?.id ?? '');
		const lastError = this.logger.getLastError();
		await this.httpApi.loadMethodsForState();
		const clientMcpStatus = await this.clientMcp.getStatus();
		let status: SettingsState['mcpStatus'] = enabled ? 'ready' : 'disabled';
		let statusText = enabled ? 'Готов к запуску агентом' : 'MCP-сервер выключен';
		if (enabled && !workspace) {
			status = 'unavailable';
			statusText = 'Откройте папку проекта';
		} else if (enabled && workspace) {
			try {
				if (databaseProfiles.length === 0) { await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspace.uri, 'Vars.bat')); }
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.extensionUri, 'dist', 'mcp-server.js'));
			} catch {
				status = 'unavailable';
				statusText = 'Не найден rdboadm.ini/Vars.bat или сборка MCP-сервера';
			}
		}
		return {
			useFolderAsProjectRoot: configuration.get(projectRootSetting, false),
			databaseRole: role,
			databaseProfile,
			databaseProfiles,
			rdboadmPath,
			rdboadmError,
			userId: configuration.get<number>('userId', 0),
			clientUsername: clientCredentials.username ?? '',
			clientPasswordSet: Boolean(clientCredentials.password),
			clientLaunchArguments: configuration.get<string>(clientLaunchArgumentsSetting, ''),
			mcpEnabled: enabled,
			mcpStatus: status,
			mcpStatusText: statusText,
			knowledgeMcpStatus,
			knowledgeMcpEnvFile,
			clientMcpUrl,
			...clientMcpStatus,
			extensionMcpTools: getRegisteredToolCatalog(),
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

	private async getKnowledgeMcpStatus(workspacePath?: string, configuredFile?: string): Promise<KnowledgeMcpStatus> {
		const cached = this.knowledgeMcpStatusCache;
		if (cached && Date.now() - cached.checkedAt < 30_000) { return cached.value; }
		const value = await checkKnowledgeMcpStatus(this.extensionUri.fsPath, workspacePath, configuredFile);
		this.knowledgeMcpStatusCache = { checkedAt: Date.now(), value };
		return value;
	}

	private connectionCode(): string {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const configuredFile = vscode.workspace.getConfiguration('vcVeTools').get<string>(knowledgeMcpEnvFileSetting, '').trim();
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

	private post(message: SettingsHostMessage): void {
		void this.panel?.webview.postMessage(message);
		void this.httpApiPanel?.webview.postMessage(message);
	}

	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri, entry = 'settings', title = 'Настройки'): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, `${entry}.js`));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
		const nonce = createNonce();
		return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csp-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>${title}</title></head><body><div id="app"></div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
	}
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
