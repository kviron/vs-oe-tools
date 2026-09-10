import * as vscode from 'vscode';
import { clientMcpUrlSetting, databaseProfileSetting, databaseRoleSetting, mcpEnabledSetting, projectRootSetting } from '../../core/constants';
import type { SettingsHostMessage, SettingsState } from '../../core/webviewProtocol';
import { isSettingsWebviewMessage } from '../../core/webviewProtocol';
import { getDatabaseRole, getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { testDatabaseConnection } from '../../infrastructure/database/classRepository';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import type { McpNavigationConnection } from '../../mcp/registerMcpServer';
import { getClientMcpHealth, stopClientMcpServer } from '../../mcp/clientMcpHttp';
import { clientMcpMethodIds, startClientMcpProcess } from '../lifecycle/oeStaticMethodExecutor';
import { loadRdboadmDatabases, saveRdboadmDatabase } from '../../infrastructure/configuration/rdboadmIni';
import { startProjectClient, updateProjectBinaries, updateProjectDatabase, updateProjectPackages } from '../project/projectCommandService';
import type { ClientCredentials } from '../project/projectCommandService';

export class SettingsViewProvider implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private clientMcpStatusTimer?: ReturnType<typeof setInterval>;
	private clientMcpDatabaseSync?: Promise<void>;
	private readonly disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly setProjectRootEnabled: (enabled: boolean) => Promise<void>,
		private readonly logger: ExtensionLogService,
		private readonly getNavigationConnection: () => McpNavigationConnection | undefined,
		private readonly databaseSelectionPath?: string,
		private readonly getClientCredentials: () => Promise<ClientCredentials> = async () => ({}),
		private readonly setClientCredentials: (credentials: ClientCredentials) => Promise<void> = async () => undefined,
	) {
		this.disposables.push(
			this.logger.onDidChange(() => void this.postState()),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('vcVeTools')) {
					void this.postState();
				}
				if (event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)
					|| event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)) {
					this.scheduleClientMcpDatabaseSync();
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

	public refresh(): void {
		void this.postState();
	}

	public dispose(): void {
		if (this.clientMcpStatusTimer) { clearInterval(this.clientMcpStatusTimer); }
		this.panel?.dispose();
		this.disposables.forEach(disposable => disposable.dispose());
	}

	private scheduleClientMcpDatabaseSync(): void {
		if (this.clientMcpDatabaseSync) { return; }
		this.clientMcpDatabaseSync = this.syncClientMcpDatabase()
			.catch(error => this.logger.error('Настройки', 'Не удалось переключить базу клиентского MCP', error))
			.finally(() => { this.clientMcpDatabaseSync = undefined; });
	}

	private async syncClientMcpDatabase(): Promise<void> {
		const clientMcpUrl = getConfiguredClientMcpUrl(vscode.workspace.getConfiguration('vcVeTools'));
		const selectedDatabase = (await getProjectDatabaseOptions()).database;
		try {
			const health = await getClientMcpHealth(clientMcpUrl);
			if (health.status.toLocaleLowerCase('en') === 'ok'
				&& health.database?.toLocaleLowerCase('en') !== selectedDatabase.toLocaleLowerCase('en')) {
				await this.setClientMcpServerRunning('stop');
				await this.setClientMcpServerRunning('start');
			}
		} catch {
			// An offline client MCP does not need database synchronization.
		}
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!isSettingsWebviewMessage(message)) {
			return;
		}
		if (message.command === 'settingsReady') {
			await this.postState();
		} else if (message.command === 'setProjectRootEnabled') {
			await this.setProjectRootEnabled(message.enabled);
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
					await updateProjectDatabase(message.role);
				} else if (message.action === 'startClient') {
					await startProjectClient(message.role, await this.getClientCredentials());
				} else if (message.action === 'updatePackages') {
					await updateProjectPackages();
				} else {
					await updateProjectBinaries();
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
		} else if (message.command === 'setMcpEnabled') {
			await vscode.workspace.getConfiguration('vcVeTools').update(mcpEnabledSetting, message.enabled, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'refreshClientMcpStatus') {
			await this.postState();
		} else if (message.command === 'startClientMcpServer') {
			await this.setClientMcpServerRunning('start');
		} else if (message.command === 'stopClientMcpServer') {
			await this.setClientMcpServerRunning('stop');
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
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const clientMcpUrl = getConfiguredClientMcpUrl(configuration);
		let currentlyOnline = false;
		try {
			const health = await getClientMcpHealth(clientMcpUrl);
			currentlyOnline = health.status.toLocaleLowerCase('en') === 'ok';
		} catch {
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
				if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
				const databaseOptions = await getProjectDatabaseOptions();
				database = databaseOptions.database;
				await startClientMcpProcess(
					workspacePath,
					databaseOptions.database,
					databaseOptions.host,
					await this.getClientCredentials(),
				);
			} else {
				await stopClientMcpServer(clientMcpUrl);
			}
			let targetStateReached = false;
			for (let attempt = 0; attempt < 10; attempt += 1) {
				try {
					const health = await getClientMcpHealth(clientMcpUrl);
					targetStateReached = action === 'start' && health.status.toLocaleLowerCase('en') === 'ok';
				} catch {
					targetStateReached = action === 'stop';
				}
				if (targetStateReached) { break; }
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			if (!targetStateReached) {
				const statusUrl = `${clientMcpUrl}/health`;
				throw new Error(action === 'start'
					? `Метод выполнен, но ${statusUrl} не ответил со статусом ok.`
					: `Метод выполнен, но ${statusUrl} продолжает отвечать.`);
			}
			const methodName = action === 'start' ? 'aiMCP.http_Start' : 'aiMCP.http_Stop';
			const methodId = clientMcpMethodIds[action];
			const actionText = action === 'start' ? 'запущен' : 'остановлен';
			const message = `Клиентский MCP ${actionText} через ${methodName} (ID ${methodId})${database ? ' в базе ' + database : ''}.`;
			this.post({ command: 'clientMcpActionFinished', action, success: true, message });
			void vscode.window.showInformationMessage(message);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.post({ command: 'clientMcpActionFinished', action, success: false, message });
			void vscode.window.showErrorMessage(`Не удалось ${action === 'start' ? 'запустить' : 'остановить'} клиентский MCP: ${message}`);
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

	private async postState(): Promise<void> {
		if (!this.panel) {
			return;
		}
		this.post({ command: 'settingsState', state: await this.getState() });
	}

	private async getState(): Promise<SettingsState> {
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const workspace = vscode.workspace.workspaceFolders?.[0];
		const enabled = configuration.get<boolean>(mcpEnabledSetting, true);
		const clientMcpUrl = getConfiguredClientMcpUrl(configuration);
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
		let clientMcpStatus: SettingsState['clientMcpStatus'] = 'offline';
		let clientMcpStatusText = 'Нет связи';
		let clientMcpDatabase: string | undefined;
		let selectedDatabase: string | undefined;
		try {
			selectedDatabase = (await getProjectDatabaseOptions()).database;
		} catch {
			selectedDatabase = undefined;
		}
		try {
			const health = await getClientMcpHealth(clientMcpUrl);
			clientMcpDatabase = health.database?.trim() || undefined;
			if (health.status.toLocaleLowerCase('en') === 'ok') {
				clientMcpStatus = 'online';
				clientMcpStatusText = clientMcpDatabase ? `Работает · ${clientMcpDatabase}` : 'Работает';
			} else {
				clientMcpStatusText = `Статус: ${health.status}`;
			}
		} catch {
			// The offline state is expected when the original client is not running.
		}
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
			mcpConnectionCode: this.connectionCode(workspace?.uri.fsPath, role, databaseProfile, clientMcpUrl),
			lastExtensionError: lastError && { timestamp: lastError.timestamp, source: lastError.source, message: lastError.message },
		};
	}

	private connectionCode(workspacePath: string | undefined, role: 'main' | 'test', profile: string, clientMcpUrl: string): string {
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

	private post(message: SettingsHostMessage): void {
		void this.panel?.webview.postMessage(message);
	}

	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'settings.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
		const nonce = createNonce();
		return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Настройки</title></head><body><div id="app"></div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
	}
}

function getConfiguredClientMcpUrl(configuration: vscode.WorkspaceConfiguration): string {
	const configured = configuration.get<string>(clientMcpUrlSetting, 'http://localhost:8080').trim();
	if (/^http:\/\/(?:localhost|127\.0\.0\.1):8080\/mcp\/?$/iu.test(configured)) {
		return configured.replace(/\/mcp\/?$/iu, '');
	}
	return configured;
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
