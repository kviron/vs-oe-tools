export interface HttpApiRequest {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface HttpApiResponse {
	status: number;
	statusText: string;
	durationMs: number;
	headers: Record<string, string>;
	cookies: string[];
	body: string;
	bodySizeBytes: number;
	contentType: string;
	url: string;
	redirected: boolean;
}

const requestTimeoutMs = 15_000;
const maximumBodyBytes = 1024 * 1024;
const maximumResponseBytes = 2 * 1024 * 1024;
const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export async function executeHttpApiRequest(request: HttpApiRequest): Promise<HttpApiResponse> {
	const method = request.method.trim().toUpperCase();
	if (!allowedMethods.has(method)) { throw new Error(`HTTP-метод ${method || 'не указан'} не поддерживается.`); }
	const url = parseHttpUrl(request.url);
	const body = method === 'GET' || method === 'HEAD' ? undefined : request.body;
	if (body && Buffer.byteLength(body, 'utf8') > maximumBodyBytes) {
		throw new Error('Тело запроса превышает 1 МБ.');
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
	const startedAt = performance.now();
	try {
		const response = await fetch(url, {
			method,
			headers: request.headers,
			body,
			signal: controller.signal,
		});
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > maximumResponseBytes) { throw new Error('Ответ превышает 2 МБ.'); }
		const contentType = response.headers.get('content-type') ?? '';
		return {
			status: response.status,
			statusText: response.statusText,
			durationMs: Math.round(performance.now() - startedAt),
			headers: Object.fromEntries(response.headers.entries()),
			cookies: response.headers.getSetCookie(),
			body: new TextDecoder(contentType.match(/charset=([^;]+)/i)?.[1] ?? 'utf-8').decode(bytes),
			bodySizeBytes: bytes.byteLength,
			contentType,
			url: response.url,
			redirected: response.redirected,
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') { throw new Error(`Запрос не ответил за ${requestTimeoutMs / 1000} секунд.`); }
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

function parseHttpUrl(value: string): URL {
	let url: URL;
	try { url = new URL(value.trim()); }
	catch { throw new Error('Укажите полный HTTP-адрес запроса.'); }
	if (url.protocol !== 'http:' && url.protocol !== 'https:') { throw new Error('Поддерживаются только http:// и https:// адреса.'); }
	return url;
}
