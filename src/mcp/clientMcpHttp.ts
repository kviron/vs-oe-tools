import { readOptionalArgument } from './arguments';
import { randomBytes } from 'node:crypto';
import { realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { readMcpRuntimeStateSync } from '../core/mcpRuntimeState';

export interface ClientMcpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
	source?: number;
}

export interface ClientMcpCallResult {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
}

interface ClientMcpToolsResponse {
	tools: ClientMcpTool[];
}

export interface ClientMcpHealth {
	status: string;
	database?: string;
	methodCodeFile?: string;
	tempDirectory?: string;
}

const defaultClientMcpUrl = 'http://localhost:8080';
const requestTimeoutMs = 30_000;
const maximumResponseLength = 10 * 1024 * 1024;
const maximumRequestUrlLength = 16_000;
const methodCodeFileProtocol = 'vcve-code-file-v1';
const maximumCodeFileBytes = 2 * 1024 * 1024;

export function getClientMcpUrl(): string {
	return normalizeBaseUrl(readOptionalArgument('--client-mcp-url') ?? readMcpRuntimeStateSync()?.clientMcpUrl ?? defaultClientMcpUrl);
}

export async function getClientMcpHealth(baseUrl = getClientMcpUrl()): Promise<ClientMcpHealth> {
	const response = await requestJson<ClientMcpHealth>(createUrl(baseUrl, 'health'), 3_000);
	if (!response || typeof response.status !== 'string') {
		throw new Error('Клиентский MCP вернул некорректный статус здоровья.');
	}
	if (response.database !== undefined && typeof response.database !== 'string') {
		throw new Error('Клиентский MCP вернул некорректное имя базы данных.');
	}
	return response;
}

export async function stopClientMcpServer(baseUrl = getClientMcpUrl()): Promise<void> {
	await requestJson<Record<string, unknown>>(createUrl(baseUrl, 'stop'), 3_000);
}

export async function listClientMcpTools(baseUrl = getClientMcpUrl()): Promise<ClientMcpTool[]> {
	const response = await requestJson<ClientMcpToolsResponse>(createUrl(baseUrl, 'tools/list'));
	if (!response || !Array.isArray(response.tools)) {
		throw new Error('Клиентский MCP вернул некорректный каталог инструментов.');
	}
	return response.tools.filter(isClientMcpTool);
}

export async function callClientMcpTool(
	name: string,
	argumentsValue: Record<string, unknown> = {},
	baseUrl = getClientMcpUrl(),
): Promise<ClientMcpCallResult> {
	const toolName = name.trim();
	if (!toolName) { throw new Error('Имя клиентского MCP-инструмента не задано.'); }

	const url = createUrl(baseUrl, 'tools/call');
	// The native wHttpListener currently accepts GET requests only.
	url.searchParams.set('name', toolName);
	url.searchParams.set('arguments', JSON.stringify(argumentsValue));
	const response = url.href.length > maximumRequestUrlLength
		? await callWithMethodCodeFile(url, toolName, argumentsValue)
		: await requestJson<ClientMcpCallResult>(url);
	if (!response || !Array.isArray(response.content)
		|| !response.content.every(item => item?.type === 'text' && typeof item.text === 'string')) {
		throw new Error('Клиентский MCP вернул некорректный результат вызова.');
	}
	return response;
}

/** Large local method edits stay GET; the native client reads a one-use UTF-8 file. */
async function callWithMethodCodeFile(url: URL, toolName: string, args: Record<string, unknown>): Promise<ClientMcpCallResult> {
	const member = normalizeMemberId(args.Member);
	if (toolName !== 'class_method_change' || member === undefined
		|| typeof args.Code !== 'string' || Object.keys(args).some(key => key !== 'Member' && key !== 'Code')) {
		throw new Error(`Параметры клиентского MCP слишком велики для HTTP API (${url.href.length} символов).`);
	}
	if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
		throw new Error('Большой исходник можно передать файлом только локальному клиентскому MCP.');
	}
	const payload = JSON.stringify({ protocol: methodCodeFileProtocol, Member: member, Code: args.Code });
	if (Buffer.byteLength(payload, 'utf8') > maximumCodeFileBytes) { throw new Error('Файл исходника метода превышает 2 МБ.'); }
	const healthUrl = new URL(url);
	healthUrl.pathname = healthUrl.pathname.replace(/\/tools\/call$/, '/health');
	healthUrl.search = '';
	const health = await requestJson<ClientMcpHealth>(healthUrl, 3_000);
	if (health.methodCodeFile !== methodCodeFileProtocol || typeof health.tempDirectory !== 'string') {
		throw new Error('Клиентский MCP не поддерживает передачу больших исходников. Обновите метод aiMCP.http_ProcessRequest (12464784).');
	}
	// Never write to an arbitrary directory advertised by an HTTP endpoint.
	const localTemp = await realpath(tmpdir());
	const nativeTemp = await realpath(health.tempDirectory);
	if (!sameLocalPath(localTemp, nativeTemp)) { throw new Error('Временные каталоги расширения и клиентского MCP не совпадают.'); }
	const token = randomBytes(16).toString('hex');
	const file = path.join(localTemp, `vcve-mcp-code-${token}.json`);
	url.searchParams.set('arguments', JSON.stringify({ Member: member }));
	url.searchParams.set('codeToken', token);
	if (url.href.length > maximumRequestUrlLength) { throw new Error('Ссылка на метод слишком велика для HTTP API.'); }
	await writeFile(file, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
	try {
		// A timeout does not prove that the mutation failed. Never retry automatically.
		return await requestJson<ClientMcpCallResult>(url);
	} catch (error) {
		throw new Error(`${error instanceof Error ? error.message : String(error)} Повтор автоматически не выполнялся; перед повтором перечитайте метод.`);
	} finally {
		await rm(file, { force: true }).catch(() => undefined);
	}
}

function normalizeMemberId(value: unknown): string | undefined {
	if (typeof value === 'string') {
		const member = value.trim();
		return member ? member : undefined;
	}
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
		return String(value);
	}
	return undefined;
}

function sameLocalPath(left: string, right: string): boolean {
	return process.platform === 'win32'
		? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
		: left === right;
}

function createUrl(baseUrl: string, path: string): URL {
	return new URL(path, `${normalizeBaseUrl(baseUrl)}/`);
}

function normalizeBaseUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`Некорректный адрес клиентского MCP: ${value}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('Адрес клиентского MCP должен использовать HTTP или HTTPS.');
	}
	if (/^\/mcp\/?$/iu.test(url.pathname)
		&& /^(?:localhost|127\.0\.0\.1)$/iu.test(url.hostname)
		&& url.port === '8080') {
		url.pathname = '/';
	}
	url.pathname = url.pathname.replace(/\/$/, '');
	url.search = '';
	url.hash = '';
	return url.href.replace(/\/$/, '');
}

async function requestJson<T>(url: URL, timeoutMs = requestTimeoutMs): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		throw new Error(`Клиентский MCP недоступен по адресу ${url.origin}: ${error instanceof Error ? error.message : String(error)}`);
	}

	const contentLength = Number(response.headers.get('content-length') ?? 0);
	if (contentLength > maximumResponseLength) {
		throw new Error(`Ответ клиентского MCP превышает ${maximumResponseLength} байт.`);
	}
	const text = await response.text();
	if (text.length > maximumResponseLength) {
		throw new Error(`Ответ клиентского MCP превышает ${maximumResponseLength} символов.`);
	}
	if (!response.ok) {
		throw new Error(`Клиентский MCP вернул HTTP ${response.status}: ${text.slice(0, 1000)}`);
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error('Клиентский MCP вернул ответ, который не является JSON.');
	}
}

function isClientMcpTool(value: unknown): value is ClientMcpTool {
	return typeof value === 'object' && value !== null
		&& 'name' in value && typeof value.name === 'string' && value.name.trim().length > 0
		&& 'description' in value && typeof value.description === 'string'
		&& 'inputSchema' in value && typeof value.inputSchema === 'object' && value.inputSchema !== null;
}
