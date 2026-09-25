import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NavigationActions } from './navigationTools';
import { validateRequest } from './navigationRequest';
import { dispatchNavigationRequest, respond } from './navigationRoute';

export function createNavigationHandler(token: string, actions: NavigationActions) {
	return (request: IncomingMessage, response: ServerResponse): void => {
		void handleRequest(request, response, token, actions);
	};
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
	token: string,
	actions: NavigationActions,
): Promise<void> {
	try {
		if (request.method !== 'POST' || request.url !== '/navigate') {
			respond(response, 404, { error: 'Not found.' });
			return;
		}
		if (!isAuthorized(request.headers.authorization, token)) {
			respond(response, 401, { error: 'Unauthorized.' });
			return;
		}
		const input = validateRequest(JSON.parse(await readBody(request)) as unknown);
		await dispatchNavigationRequest(input, response, actions);
	} catch (error) {
		respond(response, 400, { error: error instanceof Error ? error.message : String(error) });
	}
}

function isAuthorized(header: string | undefined, token: string): boolean {
	const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
	const expectedBytes = Buffer.from(token);
	const suppliedBytes = Buffer.from(supplied);
	return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	let length = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		length += buffer.length;
		if (length > 6 * 1024 * 1024) {
			throw new Error('Bridge request is too large.');
		}
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
}
