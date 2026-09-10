export interface PostmanApiHealth {
	status: string;
	database?: string;
}

export const defaultPostmanApiUrl = 'http://localhost:8080/api';

export async function getPostmanApiHealth(baseUrl = defaultPostmanApiUrl): Promise<PostmanApiHealth> {
	const url = new URL('health', `${normalizeBaseUrl(baseUrl)}/`);
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(3_000),
		});
	} catch (error) {
		throw new Error(`API для Postman недоступен по адресу ${normalizeBaseUrl(baseUrl)}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!response.ok) {
		throw new Error(`API для Postman вернул HTTP ${response.status}.`);
	}
	const value = await response.json() as unknown;
	if (!value || typeof value !== 'object' || !('status' in value) || typeof value.status !== 'string') {
		throw new Error('API для Postman вернул некорректный статус здоровья.');
	}
	const database = 'database' in value && typeof value.database === 'string' ? value.database : undefined;
	return { status: value.status, database };
}

export async function stopPostmanApiServer(baseUrl = defaultPostmanApiUrl): Promise<void> {
	const url = new URL('stop', `${normalizeBaseUrl(baseUrl)}/`);
	const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
	if (!response.ok) {
		throw new Error(`API для Postman вернул HTTP ${response.status} при остановке.`);
	}
}

function normalizeBaseUrl(value: string): string {
	const url = new URL(value);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('Адрес API для Postman должен использовать HTTP или HTTPS.');
	}
	url.pathname = url.pathname.replace(/\/$/, '');
	url.search = '';
	url.hash = '';
	return url.href.replace(/\/$/, '');
}
