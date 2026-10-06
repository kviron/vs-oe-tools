import type { ServerResponse } from 'node:http';
import type { NavigationActions } from './navigationTools';
import type { NavigationRequest } from './navigationRequest';
import { commandRegistry } from './commandRegistry';
export async function dispatchNavigationRequest(
	input: NavigationRequest,
	response: ServerResponse,
	actions: NavigationActions,
): Promise<void> {
	const result = await commandRegistry[input.action].execute(input, actions);
	respond(response, 200, { ok: true, action: input.action, ...result });
}
export function respond(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
	response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}
