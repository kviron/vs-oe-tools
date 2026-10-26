import * as assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createClientCommandUri, dispatchClientCommand, verifyGuiHealth, type GuiClient } from '../mcp/client/guiCommands';
import { stopManagedClientMcp } from '../mcp/client/lifecycle';

suite('Commands in the open FME', () => {
	const client: GuiClient = { processId: 123, database: 'oetrunk', host: 'localhost' };
	test('dispatches only to the selected existing client', async () => {
		const uris: string[] = [];
		const result = await dispatchClientCommand('oetrunk', 'localhost', 'mcp.start', {
			listClients: async () => [client, { ...client, processId: 456, database: 'oetest' }],
			openUri: async uri => { uris.push(uri); },
		});
		assert.equal(result.processId, 123);
		assert.deepEqual(uris, ['oe-oetrunk:/command/mcp.start']);
	});
	test('rejects missing, ambiguous and wrong-host clients before dispatch', async () => {
		for (const clients of [[], [client, client], [{ ...client, host: 'other' }]]) {
			await assert.rejects(dispatchClientCommand('oetrunk', 'localhost', 'mcp.start', {
				listClients: async () => clients, openUri: async () => { assert.fail('Unexpected URI dispatch'); },
			}), /ровно один/);
		}
	});
	test('rejects URI and shell injection', () => {
		for (const name of ['mcp.start/1', 'mcp.start?x=1', "x'; calc", '1', 'a'.repeat(101)]) {
			assert.throws(() => createClientCommandUri('oetrunk', name));
		}
		assert.throws(() => createClientCommandUri("db'; calc", 'mcp.start'));
	});
	test('requires exact database, GUI mode and PID as execution proof', () => {
		const health = { status: 'ok', database: 'oetrunk', processId: 123, isConsole: false };
		verifyGuiHealth(health, client);
		for (const other of [{ ...health, database: 'oetest' }, { ...health, processId: 456 },
			{ ...health, isConsole: true }, { status: 'ok', database: 'oetrunk' }]) {
			assert.throws(() => verifyGuiHealth(other, client), /не подтверждено/);
		}
	});
	for (const force of [false, true]) {
		test(force ? 'explicit stop can stop a GUI listener' : 'automatic cleanup preserves a GUI listener', async () => {
			let stops = 0;
			const server = createServer((request, response) => {
				response.setHeader('connection', 'close');
				if (request.url === '/stop') {
					stops++; response.end('{"status":"stopping"}'); server.close();
				} else { response.end(JSON.stringify({ status: 'ok', isConsole: false })); }
			});
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const address = server.address();
			if (!address || typeof address === 'string') { throw new Error('Missing listener'); }
			try {
				assert.equal((await stopManagedClientMcp(force, `http://127.0.0.1:${address.port}`)).stopped, force);
				assert.equal(stops, force ? 1 : 0);
			} finally { if (server.listening) { await new Promise<void>(resolve => server.close(() => resolve())); } }
		});
	}
});
