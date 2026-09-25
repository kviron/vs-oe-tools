import * as assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import { dispatchNavigationRequest } from '../features/ai/navigationRoute';
import type { NavigationActions } from '../features/ai/navigationTools';
import type { NavigationRequest } from '../features/ai/navigationRequest';

suite('Navigation route', () => {
	test('preserves response shapes and ordered calls', async () => {
		const calls: string[] = [];
		const actions = {
			revealClass: async (id: number) => { calls.push(`reveal:${id}`); },
			openClass: async (id: number) => { calls.push(`open:${id}`); },
			compileMethod: async () => ({ passed: true }),
			updateMethodSource: async () => ({ changed: true }),
			updatePackages: async () => false,
			updateDatabase: async (role: string) => { calls.push(`database:${role}`); },
			openClientEntity: async () => 'oe-main:/open/Class/7',
		} as unknown as NavigationActions;
		const invoke = async (input: NavigationRequest): Promise<Record<string, unknown>> => {
			let status: number | undefined;
			let body = '';
			const response = {
				writeHead: (code: number) => { status = code; },
				end: (value: string) => { body = value; },
			} as ServerResponse;
			await dispatchNavigationRequest(input, response, actions);
			assert.equal(status, 200);
			return JSON.parse(body) as Record<string, unknown>;
		};

		assert.deepEqual(await invoke({ action: 'open_class', id: 7 }), { ok: true, action: 'open_class', id: 7 });
		assert.deepEqual(calls, ['reveal:7', 'open:7']);
		assert.deepEqual(await invoke({ action: 'compile_method', id: 7 }),
			{ ok: true, action: 'compile_method', result: { passed: true } });
		assert.deepEqual(await invoke({ action: 'update_method_source', id: 7 }),
			{ ok: true, action: 'update_method_source', changed: true });
		assert.deepEqual(await invoke({ action: 'update_packages' }),
			{ ok: true, action: 'update_packages', launched: false });
		assert.deepEqual(await invoke({ action: 'update_database', role: 'test' }),
			{ ok: true, action: 'update_database', role: 'test' });
		assert.deepEqual(await invoke({ action: 'open_client_entity', role: 'main', entityType: 'Class', id: 7 }),
			{ ok: true, action: 'open_client_entity', role: 'main', entityType: 'Class', id: 7, uri: 'oe-main:/open/Class/7' });
	});
});
