import { readOptionalArgument } from './arguments';

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
}

const defaultClientMcpUrl = 'http://localhost:8080/mcp';
const requestTimeoutMs = 30_000;
const maximumResponseLength = 10 * 1024 * 1024;
const maximumRequestUrlLength = 16_000;

export function getClientMcpUrl(): string {
	return normalizeBaseUrl(readOptionalArgument('--client-mcp-url') ?? defaultClientMcpUrl);
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
	url.searchParams.set('name', toolName);
	url.searchParams.set('arguments', JSON.stringify(argumentsValue));
	if (url.href.length > maximumRequestUrlLength) {
		throw new Error(`Параметры клиентского MCP слишком велики для HTTP API (${url.href.length} символов).`);
	}

	const response = await requestJson<ClientMcpCallResult>(url);
	if (!response || !Array.isArray(response.content)
		|| !response.content.every(item => item?.type === 'text' && typeof item.text === 'string')) {
		throw new Error('Клиентский MCP вернул некорректный результат вызова.');
	}
	return response;
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
