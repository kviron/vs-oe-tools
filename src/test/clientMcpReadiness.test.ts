import * as assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { prepareClientMcpStart } from '../mcp/client/readiness';

suite('Client MCP readiness recovery', () => {
	let server: Server;
	let url: string;
	let status: number;
	let body: string;
	let stops: number;
	let stopFails: boolean;

	setup(async () => {
		status = 200; body = JSON.stringify({ status: 'ok', database: 'oetrunk' }); stops = 0; stopFails = false;
		server = createServer((request, response) => {
			response.setHeader('connection', 'close');
			if (request.url === '/stop') {
				stops++;
				response.statusCode = stopFails ? 500 : 200;
				response.end(JSON.stringify({ status: stopFails ? 'failed' : 'stopping' }));
				if (!stopFails) { server.close(); }
			} else { response.statusCode = status; response.end(body); }
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') { throw new Error('Missing test listener'); }
		url = `http://127.0.0.1:${address.port}`;
	});
	teardown(async () => {
		if (server.listening) { await new Promise<void>(resolve => server.close(() => resolve())); }
	});

	test('reuses a healthy session without stopping it', async () => {
		assert.equal((await prepareClientMcpStart(url))?.database, 'oetrunk'); assert.equal(stops, 0);
	});
	test('allows startup when the listener is absent', async () => {
		await new Promise<void>(resolve => server.close(() => resolve()));
		assert.equal(await prepareClientMcpStart(url), undefined);
	});
	for (const error of ['neNoSessionKeyOrReconnectUIError', 'Удаленный хост принудительно разорвал существующее подключение(10054)']) {
		test(`stops the stale listener before allowing startup: ${error}`, async () => {
			status = 500; body = JSON.stringify({ error });
			assert.equal(await prepareClientMcpStart(url), undefined); assert.equal(stops, 1); assert.equal(server.listening, false);
		});
	}
	test('does not replace a listener with an unrelated server error', async () => {
		status = 500; body = JSON.stringify({ error: 'database unavailable' });
		await assert.rejects(prepareClientMcpStart(url), /database unavailable/); assert.equal(stops, 0);
	});
	test('does not replace a malformed or unhealthy listener', async () => {
		body = JSON.stringify({ status: 'starting' });
		await assert.rejects(prepareClientMcpStart(url), /starting/); assert.equal(stops, 0);
	});
	test('blocks startup if shutdown fails', async () => {
		status = 500; body = JSON.stringify({ error: 'neNoSessionKeyOrReconnectUIError' }); stopFails = true;
		await assert.rejects(prepareClientMcpStart(url), /HTTP 500/); assert.equal(stops, 1); assert.equal(server.listening, true);
	});
	test('propagates a health timeout instead of treating it as a missing listener', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => { throw new DOMException('health timeout', 'TimeoutError'); };
		try { await assert.rejects(prepareClientMcpStart(url), /health timeout/); assert.equal(stops, 0); }
		finally { globalThis.fetch = originalFetch; }
	});
});
