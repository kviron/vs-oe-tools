import * as vscode from 'vscode';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { startHttpTestServerProcess, type HttpTestServerProcess } from '../lifecycle/oeStaticMethodExecutor';
import type { ClientCredentials } from '../project';
import { executeHttpApiRequest, type HttpApiRequest } from '../http-api/httpApiRequest';
import { HttpServerLifecycle } from '../http-api/httpServerLifecycle';
import { executeDirectHttpMethod, validateDirectHttpMethodRequest, type DirectHttpMethodRequest } from '../http-api/directHttpMethod';
import { loadHttpMethods, searchHttpParameterValues, type HttpMethodDefinition } from '../http-api/httpMethodRepository';

/** Owns the HTTP API test process and in-flight direct request. */
export class HttpApiService {
	public readonly executeRequest = executeHttpApiRequest;
	public readonly searchParameterValues = searchHttpParameterValues;
	private readonly lifecycle = new HttpServerLifecycle<HttpTestServerProcess>();
	private directRequestController?: AbortController;
	public methods: HttpMethodDefinition[] = [];
	public methodsError?: string;

	public constructor(private readonly getClientCredentials: () => Promise<ClientCredentials>) {}

	public get server(): HttpTestServerProcess | undefined { return this.lifecycle.server; }

	public async refreshMethods(): Promise<void> {
		this.methods = await loadHttpMethods();
		this.methodsError = undefined;
	}

	public async loadMethodsForState(): Promise<void> {
		try { await this.refreshMethods(); }
		catch (error) {
			this.methods = [];
			this.methodsError = error instanceof Error ? error.message : String(error);
		}
	}

	public async start(methodName: string): Promise<Record<string, unknown>> {
		await this.lifecycle.replace(async () => {
			await this.refreshMethods();
			const selected = this.methods.find(item => item.name === methodName);
			if (!selected) { throw new Error('Выбранный HTTP-метод не найден в текущей базе.'); }
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
			const options = await getProjectDatabaseOptions();
			return startHttpTestServerProcess(workspacePath, selected.name, options.database, options.host, await this.getClientCredentials());
		});
		return this.getServerState();
	}

	public async stop(): Promise<Record<string, unknown>> {
		await this.lifecycle.replace();
		return { running: false };
	}

	public async callServer(request: Omit<HttpApiRequest, 'url'> & { methodName?: string }): Promise<Record<string, unknown>> {
		const server = this.server;
		if (!server || !server.isRunning()) { throw new Error('Тестовый HTTP-сервер не запущен.'); }
		const state = this.getServerState();
		const url = new URL(server.url);
		url.searchParams.set('method', request.methodName?.trim() || server.methodName);
		const response = await executeHttpApiRequest({
			method: typeof request.method === 'string' && request.method.trim() ? request.method : 'GET',
			url: url.toString(), headers: request.headers ?? {}, body: request.body,
		});
		return { server: state, response };
	}

	public async callDirect(input: DirectHttpMethodRequest) {
		if (this.directRequestController) { throw new Error('Предыдущий прямой вызов ещё выполняется.'); }
		const request = validateDirectHttpMethodRequest(input);
		const controller = new AbortController();
		this.directRequestController = controller;
		try {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
			const options = await getProjectDatabaseOptions();
			const methods = await loadHttpMethods();
			if (!methods.some(method => method.name === request.methodName)) { throw new Error('Метод не найден в каталоге текущей базы. Обновите список методов.'); }
			return await executeDirectHttpMethod(workspacePath, request, options.database, options.host, await this.getClientCredentials(), controller.signal);
		} finally {
			this.directRequestController = undefined;
		}
	}

	public getServerState(): Record<string, unknown> {
		if (this.server && !this.server.isRunning()) { this.lifecycle.server = undefined; }
		return this.server ? {
			running: true, methodName: this.server.methodName, database: this.server.database,
			url: this.server.url, processId: this.server.processId,
		} : { running: false };
	}

	public dispose(): Promise<void> {
		this.directRequestController?.abort();
		return this.lifecycle.replace().then(() => undefined);
	}
}
