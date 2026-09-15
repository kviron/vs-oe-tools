import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Disposable } from 'vscode';
import type { NavigationActions } from './navigationTools';
import type { ClassAttributeDraft } from '../classes/models';
import { createLifecycleParameterMethodId } from '../lifecycle/lifecycleMethodExecution';

type NavigationAction = 'reveal_class' | 'open_class' | 'open_method' | 'reveal_method' | 'update_method_source'
	| 'get_svn_file_history' | 'get_package_sync_changes' | 'update_database' | 'start_client'
	| 'open_client_entity' | 'get_production_tasks' | 'get_production_task' | 'get_production_tasks_in_progress'
	| 'update_packages' | 'update_binaries' | 'create_class_attribute' | 'execute_lifecycle_method' | 'start_client_mcp'
	| 'start_http_test_server' | 'stop_http_test_server' | 'get_http_test_server_status' | 'call_http_test_server';

interface NavigationRequest {
	action: NavigationAction;
	id?: number;
	classId?: number;
	code?: string;
	filePath?: string;
	limit?: number;
	query?: string;
	offset?: number;
	role?: 'main' | 'test';
	entityType?: string;
	draft?: ClassAttributeDraft;
	methodParameter?: string;
	database?: string;
	host?: string;
	httpMethod?: string;
	headers?: Record<string, string>;
	body?: string;
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
			await actions.revealClass(input.id as number);
		} else if (input.action === 'open_class') {
			await actions.revealClass(input.id as number);
			await actions.openClass(input.id as number);
		} else if (input.action === 'open_method') {
			await actions.openMethod(input.id as number);
		} else if (input.action === 'reveal_method') {
			await actions.revealMethod(input.classId as number, input.id as number);
		} else if (input.action === 'update_method_source') {
			const result = await actions.updateMethodSource(input.id as number, input.code as string);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'create_class_attribute') {
			const result = await actions.createClassAttribute(input.draft as ClassAttributeDraft);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'execute_lifecycle_method') {
			const result = await actions.executeLifecycleMethod(input.id as number, input.methodParameter as string, input.database as string, input.host as string);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'start_client_mcp') {
			const result = await actions.startClientMcp(input.database as string, input.host as string);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'start_http_test_server') {
			respond(response, 200, { ok: true, action: input.action, ...await actions.startHttpTestServer(input.methodParameter as string) });
			return;
		} else if (input.action === 'stop_http_test_server') {
			respond(response, 200, { ok: true, action: input.action, ...await actions.stopHttpTestServer() });
			return;
		} else if (input.action === 'get_http_test_server_status') {
			respond(response, 200, { ok: true, action: input.action, ...await actions.getHttpTestServerStatus() });
			return;
		} else if (input.action === 'call_http_test_server') {
			respond(response, 200, { ok: true, action: input.action, ...await actions.callHttpTestServer({
				method: input.httpMethod!, methodName: input.methodParameter,
				headers: input.headers, body: input.body,
			}) });
			return;
		} else if (input.action === 'get_svn_file_history') {
			const result = await actions.getSvnFileHistory(input.filePath as string, input.limit as number);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'get_package_sync_changes') {
			const result = await actions.getPackageSyncChanges(input.query, input.offset as number, input.limit as number);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'get_production_tasks') {
			const result = await actions.getProductionTasks(input.query, input.limit as number);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'get_production_task') {
			const result = await actions.getProductionTask(input.query as string, input.limit as number);
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'get_production_tasks_in_progress') {
			const result = await actions.getProductionTasksInProgress();
			respond(response, 200, { ok: true, action: input.action, ...result });
			return;
		} else if (input.action === 'update_packages') {
			const launched = await actions.updatePackages();
			respond(response, 200, { ok: true, action: input.action, launched });
			return;
		} else if (input.action === 'update_binaries') {
			const launched = await actions.updateBinaries();
			respond(response, 200, { ok: true, action: input.action, launched });
			return;
		} else if (input.action === 'update_database') {
			await actions.updateDatabase(input.role as 'main' | 'test');
			respond(response, 200, { ok: true, action: input.action, role: input.role });
			return;
		} else if (input.action === 'start_client') {
			await actions.startClient(input.role as 'main' | 'test');
			respond(response, 200, { ok: true, action: input.action, role: input.role });
			return;
		} else {
			const uri = await actions.openClientEntity(input.role as 'main' | 'test', input.entityType as string, input.id as number);
			respond(response, 200, { ok: true, action: input.action, role: input.role, entityType: input.entityType, id: input.id, uri });
			return;
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
		if (length > 6 * 1024 * 1024) {
			throw new Error('Bridge request is too large.');
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
	if (action !== 'reveal_class' && action !== 'open_class' && action !== 'open_method' && action !== 'reveal_method'
		&& action !== 'update_method_source' && action !== 'get_svn_file_history' && action !== 'get_package_sync_changes'
		&& action !== 'update_database' && action !== 'start_client' && action !== 'open_client_entity'
		&& action !== 'get_production_tasks' && action !== 'get_production_task' && action !== 'get_production_tasks_in_progress'
		&& action !== 'update_packages' && action !== 'update_binaries' && action !== 'create_class_attribute'
		&& action !== 'execute_lifecycle_method' && action !== 'start_client_mcp'
		&& action !== 'start_http_test_server' && action !== 'stop_http_test_server'
		&& action !== 'get_http_test_server_status' && action !== 'call_http_test_server') {
		throw new Error('Unknown navigation action.');
	}
	if (action !== 'get_svn_file_history' && action !== 'get_package_sync_changes' && action !== 'update_database'
		&& action !== 'start_client' && action !== 'get_production_tasks' && action !== 'get_production_task' && action !== 'get_production_tasks_in_progress'
		&& action !== 'update_packages' && action !== 'update_binaries'
		&& action !== 'create_class_attribute' && action !== 'start_client_mcp'
		&& action !== 'start_http_test_server' && action !== 'stop_http_test_server'
		&& action !== 'get_http_test_server_status' && action !== 'call_http_test_server'
		&& (!Number.isSafeInteger(id) || (id ?? 0) <= 0)) {
		throw new Error('Navigation ID must be a positive integer.');
	}
	const classId = (value as Partial<NavigationRequest>).classId;
	if (action === 'reveal_method' && (!Number.isSafeInteger(classId) || (classId ?? 0) <= 0)) {
		throw new Error('Navigation classId must be a positive integer for reveal_method.');
	}
	const code = (value as Partial<NavigationRequest>).code;
	if (action === 'update_method_source' && typeof code !== 'string') {
		throw new Error('Method code must be a string for update_method_source.');
	}
	const draft = (value as Partial<NavigationRequest>).draft;
	if (action === 'create_class_attribute' && (!draft || typeof draft !== 'object')) {
		throw new Error('draft is required for create_class_attribute.');
	}
	const methodParameter = (value as Partial<NavigationRequest>).methodParameter;
	const database = (value as Partial<NavigationRequest>).database;
	const host = (value as Partial<NavigationRequest>).host;
	if (action === 'execute_lifecycle_method' && (typeof methodParameter !== 'string' || !methodParameter.trim())) {
		throw new Error('methodParameter is required for execute_lifecycle_method.');
	}
	if (action === 'execute_lifecycle_method' && id !== createLifecycleParameterMethodId) {
		throw new Error(`Method ${id} is not allowlisted for execute_lifecycle_method.`);
	}
	if (action === 'execute_lifecycle_method' && (typeof database !== 'string' || !/^[\p{L}\p{N}_.-]+$/u.test(database))) {
		throw new Error('database is invalid for execute_lifecycle_method.');
	}
	if (action === 'execute_lifecycle_method' && (typeof host !== 'string' || !/^[\p{L}\p{N}_.:-]+$/u.test(host))) {
		throw new Error('host is invalid for execute_lifecycle_method.');
	}
	if (action === 'start_client_mcp' && (typeof database !== 'string' || !/^[\p{L}\p{N}_.-]+$/u.test(database))) {
		throw new Error('database is invalid for start_client_mcp.');
	}
	if (action === 'start_client_mcp' && (typeof host !== 'string' || !/^[\p{L}\p{N}_.:-]+$/u.test(host))) {
		throw new Error('host is invalid for start_client_mcp.');
	}
	if (action === 'start_http_test_server' && (typeof methodParameter !== 'string' || !methodParameter.trim())) {
		throw new Error('An exact methodName is required for start_http_test_server.');
	}
	const httpMethod = (value as Partial<NavigationRequest>).httpMethod;
	if (action === 'call_http_test_server' && (typeof httpMethod !== 'string' || !httpMethod.trim())) {
		throw new Error('httpMethod is required for call_http_test_server.');
	}
	const headers = (value as Partial<NavigationRequest>).headers;
	const body = (value as Partial<NavigationRequest>).body;
	if (action === 'call_http_test_server') {
		if (headers !== undefined && (!headers || typeof headers !== 'object' || Array.isArray(headers)
			|| Object.values(headers).some(header => typeof header !== 'string'))) {
			throw new Error('HTTP headers must be an object with string values.');
		}
		if (body !== undefined && typeof body !== 'string') { throw new Error('HTTP body must be a string.'); }
	}
	const filePath = (value as Partial<NavigationRequest>).filePath;
	const limit = (value as Partial<NavigationRequest>).limit;
	if (action === 'get_svn_file_history' && (typeof filePath !== 'string' || !filePath.trim())) {
		throw new Error('filePath is required for get_svn_file_history.');
	}
	if (action === 'get_svn_file_history' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
		throw new Error('SVN history limit must be an integer from 1 to 500.');
	}
	const query = (value as Partial<NavigationRequest>).query;
	const offset = (value as Partial<NavigationRequest>).offset;
	if (action === 'get_package_sync_changes' && query !== undefined && typeof query !== 'string') {
		throw new Error('Package synchronization query must be a string.');
	}
	if (action === 'get_package_sync_changes' && (!Number.isSafeInteger(offset) || (offset ?? -1) < 0)) {
		throw new Error('Package synchronization offset must be a non-negative integer.');
	}
	if (action === 'get_package_sync_changes' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
		throw new Error('Package synchronization limit must be an integer from 1 to 500.');
	}
	if (action === 'get_production_tasks' && query !== undefined && typeof query !== 'string') {
		throw new Error('Production tasks query must be a string.');
	}
	if (action === 'get_production_tasks' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 250)) {
		throw new Error('Production tasks limit must be an integer from 1 to 250.');
	}
	if (action === 'get_production_task' && (typeof query !== 'string' || !query.trim())) {
		throw new Error('Production task query must be a non-empty string.');
	}
	if (action === 'get_production_task' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 25)) {
		throw new Error('Production task search limit must be an integer from 1 to 25.');
	}
	const role = (value as Partial<NavigationRequest>).role;
	if ((action === 'update_database' || action === 'start_client' || action === 'open_client_entity') && role !== 'main' && role !== 'test') {
		throw new Error(`Role must be main or test for ${action}.`);
	}
	const entityType = (value as Partial<NavigationRequest>).entityType;
	if (action === 'open_client_entity' && (typeof entityType !== 'string' || !entityType.trim())) {
		throw new Error('entityType is required for open_client_entity.');
	}
	return { action, id, classId, code, filePath, limit, query, offset, role, entityType, draft, methodParameter, database, host, httpMethod, headers, body };
}

function respond(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
	response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}
