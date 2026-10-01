import * as vscode from 'vscode';
import { clientMcpUrlSetting } from '../../core/constants';
import type { SettingsState } from '../../core/webviewProtocol';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import { getClientMcpHealth, listClientMcpTools, stopClientMcpServer } from '../../mcp/client/http';
import { startClientMcpProcess } from '../lifecycle/oeStaticMethodExecutor';
import type { ClientCredentials } from '../project';

export function configuredClientMcpUrl(): string {
	const configured = vscode.workspace.getConfiguration('vcVeTools').get<string>(clientMcpUrlSetting, 'http://localhost:8080').trim();
	if (/^http:\/\/(?:localhost|127\.0\.0\.1):8080\/mcp\/?$/iu.test(configured)) {
		return configured.replace(/\/mcp\/?$/iu, '');
	}
	return configured;
}

/** Owns the native client MCP process transition and tool catalog cache. */
export class ClientMcpService {
	private static readonly toolsCacheKey = 'vcVeTools.clientMcpTools.v1';
	private databaseSync?: Promise<void>;
	public tools?: SettingsState['clientMcpTools'];
	public toolsDatabase?: string;
	public toolsUpdatedAt?: string;
	public toolsError?: string;

	public recordToolsError(error: unknown): void {
		this.tools = undefined;
		this.toolsError = error instanceof Error ? error.message : String(error);
	}

	public constructor(
		private readonly getCredentials: () => Promise<ClientCredentials>,
		private readonly logger: ExtensionLogService,
		private readonly workspaceState?: vscode.Memento,
	) {
		const cached = workspaceState?.get<{ database: string; updatedAt: string; tools: NonNullable<SettingsState['clientMcpTools']> }>(ClientMcpService.toolsCacheKey);
		if (cached) {
			this.tools = cached.tools;
			this.toolsDatabase = cached.database;
			this.toolsUpdatedAt = cached.updatedAt;
		}
	}

	public scheduleDatabaseSync(changeRunning: (action: 'start' | 'stop') => Promise<void>): void {
		if (this.databaseSync) { return; }
		this.databaseSync = this.syncDatabase(changeRunning)
			.then(() => this.refreshTools(true))
			.catch(error => this.logger.error('Настройки', 'Не удалось переключить базу клиентского MCP', error))
			.finally(() => { this.databaseSync = undefined; });
	}

	private async syncDatabase(changeRunning: (action: 'start' | 'stop') => Promise<void>): Promise<void> {
		const url = configuredClientMcpUrl();
		const selectedDatabase = (await getProjectDatabaseOptions()).database;
		try {
			const health = await getClientMcpHealth(url);
			if (health.status.toLocaleLowerCase('en') === 'ok'
				&& health.database?.toLocaleLowerCase('en') !== selectedDatabase.toLocaleLowerCase('en')) {
				await changeRunning('stop');
				await changeRunning('start');
			}
		} catch {
			// An offline client MCP does not need database synchronization.
		}
	}

	public async changeRunning(action: 'start' | 'stop', onStarted?: () => void): Promise<{ changed: boolean; message?: string }> {
		const url = configuredClientMcpUrl();
		let online = false;
		try { online = (await getClientMcpHealth(url)).status.toLocaleLowerCase('en') === 'ok'; }
		catch { online = false; }
		if ((action === 'start' && online) || (action === 'stop' && !online)) { return { changed: false }; }
		onStarted?.();
		let database = '';
		let startedMethodId: number | undefined;
		if (action === 'start') {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
			const options = await getProjectDatabaseOptions();
			database = options.database;
			const started = await startClientMcpProcess(workspacePath, options.database, options.host, await this.getCredentials());
			startedMethodId = started.methodId;
		} else {
			await stopClientMcpServer(url);
		}
		let reached = false;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			try {
				const health = await getClientMcpHealth(url);
				reached = action === 'start' && health.status.toLocaleLowerCase('en') === 'ok';
			} catch { reached = action === 'stop'; }
			if (reached) { break; }
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		if (!reached) {
			const statusUrl = `${url}/health`;
			throw new Error(action === 'start'
				? `Метод выполнен, но ${statusUrl} не ответил со статусом ok.`
				: `Метод выполнен, но ${statusUrl} продолжает отвечать.`);
		}
		if (action === 'start') {
			try { await this.loadTools(url, database); }
			catch (error) { this.recordToolsError(error); }
		} else {
			this.tools = undefined;
			this.toolsError = undefined;
		}
		const actionText = action === 'start' ? 'запущен' : 'остановлен';
		const toolsText = action === 'start' && this.toolsError ? ' Проверка списка инструментов завершилась ошибкой.' : '';
		const route = action === 'start' ? `через Функции_IDE.startClientMcp (ID ${startedMethodId})` : 'через HTTP /stop';
		return { changed: true, message: `Клиентский MCP ${actionText} ${route}${database ? ' в базе ' + database : ''}.${toolsText}` };
	}

	public async refreshTools(stopAfterTemporaryStart: boolean): Promise<void> {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
		const url = configuredClientMcpUrl();
		const options = await getProjectDatabaseOptions();
		let startedTemporarily = false;
		let health: Awaited<ReturnType<typeof getClientMcpHealth>> | undefined;
		try {
			try { health = await getClientMcpHealth(url); } catch { health = undefined; }
			const wasOnline = health?.status.toLocaleLowerCase('en') === 'ok';
			const selected = wasOnline && health?.database?.toLocaleLowerCase('en') === options.database.toLocaleLowerCase('en');
			if (!selected) {
				if (wasOnline) { await stopClientMcpServer(url); }
				startedTemporarily = stopAfterTemporaryStart && !wasOnline;
				await startClientMcpProcess(workspacePath, options.database, options.host, await this.getCredentials());
				await this.waitForServer(url, options.database);
			}
			await this.loadTools(url, options.database);
		} finally {
			if (startedTemporarily) {
				try { await stopClientMcpServer(url); }
				catch (error) { this.logger.warning('MCP client', 'Не удалось остановить временно запущенный MCP после чтения каталога.', error); }
			}
		}
	}

	private async waitForServer(url: string, database: string): Promise<void> {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			try {
				const health = await getClientMcpHealth(url);
				if (health.status.toLocaleLowerCase('en') === 'ok'
					&& health.database?.toLocaleLowerCase('en') === database.toLocaleLowerCase('en')) { return; }
			} catch { /* The client can still be starting. */ }
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		throw new Error(`Клиентский MCP для базы ${database} не запустился.`);
	}

	private async loadTools(url: string, database?: string): Promise<void> {
		const tools = await listClientMcpTools(url);
		this.tools = tools.map(tool => ({ name: tool.name, description: tool.description.trim() }))
			.sort((left, right) => left.name.localeCompare(right.name, 'ru'));
		this.toolsDatabase = database;
		this.toolsUpdatedAt = new Date().toISOString();
		this.toolsError = undefined;
		if (database && this.workspaceState) {
			await this.workspaceState.update(ClientMcpService.toolsCacheKey, {
				database, updatedAt: this.toolsUpdatedAt, tools: this.tools,
			});
		}
	}

	public async getStatus(): Promise<Pick<SettingsState, 'clientMcpStatus' | 'clientMcpStatusText' | 'clientMcpDatabase' | 'clientMcpDatabaseMatchesSelection'>> {
		let clientMcpStatus: SettingsState['clientMcpStatus'] = 'offline';
		let clientMcpStatusText = 'Нет связи';
		let clientMcpDatabase: string | undefined;
		let selectedDatabase: string | undefined;
		try { selectedDatabase = (await getProjectDatabaseOptions()).database; }
		catch { selectedDatabase = undefined; }
		try {
			const health = await getClientMcpHealth(configuredClientMcpUrl());
			clientMcpDatabase = health.database?.trim() || undefined;
			if (health.status.toLocaleLowerCase('en') === 'ok') {
				clientMcpStatus = 'online';
				clientMcpStatusText = clientMcpDatabase ? `Работает · ${clientMcpDatabase}` : 'Работает';
			} else { clientMcpStatusText = `Статус: ${health.status}`; }
		} catch { /* The offline state is expected when the original client is not running. */ }
		return { clientMcpStatus, clientMcpStatusText, clientMcpDatabase,
			clientMcpDatabaseMatchesSelection: clientMcpDatabase && selectedDatabase
				? clientMcpDatabase.toLocaleLowerCase('en') === selectedDatabase.toLocaleLowerCase('en') : undefined };
	}
}
