import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Disposable } from 'vscode';
import type { NavigationActions } from './navigationTools';

type NavigationAction = 'reveal_class' | 'open_class' | 'open_method' | 'reveal_method';

interface NavigationRequest {
	action: NavigationAction;
	id: number;
	classId?: number;
}

export interface NavigationBridge extends Disposable {
	readonly url: string;
	readonly token: string;
	readonly infoPath: string;
}

export async function startNavigationBridge(actions: NavigationActions, infoPath: string): Promise<NavigationBridge> {
	const token = randomBytes(32).toString('hex');
	const server = createServer((request, response) => void handleRequest(request, response, token, actions));
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	const address = server.address() as AddressInfo;
	const url = `http://127.0.0.1:${address.port}/navigate`;
	await mkdir(dirname(infoPath), { recursive: true });
	await writeFile(infoPath, JSON.stringify({ url, token }), { encoding: 'utf8', mode: 0o600 });
	return {
		url,
		token,
		infoPath,
		dispose: () => {
			server.close();
			void removeOwnInfoFile(infoPath, token);
		},
	};
}

async function removeOwnInfoFile(infoPath: string, token: string): Promise<void> {
	try {
		const current = JSON.parse(await readFile(infoPath, 'utf8')) as { token?: string };
		if (current.token === token) {
			await unlink(infoPath);
		}
	} catch {
		// The file may already be gone or replaced by a newer extension host.
	}
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
		if (input.action === 'reveal_class') {
			await actions.revealClass(input.id);
		} else if (input.action === 'open_class') {
			await actions.revealClass(input.id);
			await actions.openClass(input.id);
		} else if (input.action === 'open_method') {
			await actions.openMethod(input.id);
		} else {
			await actions.revealMethod(input.classId as number, input.id);
		}
		respond(response, 200, { ok: true, action: input.action, id: input.id });
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
		if (length > 4096) {
			throw new Error('Navigation request is too large.');
		}
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
}

function validateRequest(value: unknown): NavigationRequest {
	if (!value || typeof value !== 'object') {
		throw new Error('Invalid navigation request.');
	}
	const { action, id } = value as Partial<NavigationRequest>;
	if (action !== 'reveal_class' && action !== 'open_class' && action !== 'open_method' && action !== 'reveal_method') {
		throw new Error('Unknown navigation action.');
	}
	if (!Number.isSafeInteger(id) || (id ?? 0) <= 0) {
		throw new Error('Navigation ID must be a positive integer.');
	}
	const classId = (value as Partial<NavigationRequest>).classId;
	if (action === 'reveal_method' && (!Number.isSafeInteger(classId) || (classId ?? 0) <= 0)) {
		throw new Error('Navigation classId must be a positive integer for reveal_method.');
	}
	return { action, id: id as number, classId };
}

function respond(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
	response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}
