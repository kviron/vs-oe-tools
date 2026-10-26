import * as assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import { fetchLocalClientMcp } from '../mcp/client/ipv4Transport';
import { isSettingsWebviewMessage } from '../core/webviewProtocol';

suite('Client MCP IPv4 transport', () => {
	let server: Server;
	let url: URL;
	let calls: number;
	test('requires a boolean preference from the settings webview', () => {
		for (const enabled of [true, false]) {
			assert.equal(isSettingsWebviewMessage({ command: 'setClientMcpPreferIPv4', enabled }), true);
		}
		for (const enabled of [undefined, 'true', 1, null]) {
			assert.equal(isSettingsWebviewMessage({ command: 'setClientMcpPreferIPv4', enabled }), false);
		}
	});
	setup(async () => {
		calls = 0;
		server = createServer((request, response) => {
			calls++;
			if (request.url === '/slow') { return; }
			response.setHeader('content-type', 'application/json');
			response.end(JSON.stringify({ host: request.headers.host, method: request.method }));
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		url = new URL(`http://localhost:${address.port}/health`);
	});
	teardown(async () => {
		server.closeAllConnections();
		await new Promise<void>(resolve => server.close(() => resolve()));
	});
	test('connects over IPv4 while preserving localhost Host and response headers', async () => {
		const response = await fetchLocalClientMcp(url, true, 1000, 10000);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('content-type'), 'application/json');
		assert.deepEqual(await response.json(), { host: url.host, method: 'GET' });
		assert.equal(calls, 1);
	});
	test('reports connection refusal after each stop, without retries', async () => {
		const port = Number(url.port);
		for (let cycle = 0; cycle < 2; cycle++) {
			await fetchLocalClientMcp(url, true, 1000, 10000);
			await new Promise<void>(resolve => server.close(() => resolve()));
			await assert.rejects(fetchLocalClientMcp(url, true, 1000, 10000), { code: 'ECONNREFUSED' });
			await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
		}
		assert.equal(calls, 2);
	});
	test('limits response size and times out without replaying requests', async () => {
		await assert.rejects(fetchLocalClientMcp(url, true, 1000, 1), /превышает/);
		url.pathname = '/slow';
		await assert.rejects(fetchLocalClientMcp(url, true, 50, 10000), { name: 'AbortError' });
		assert.equal(calls, 2);
	});
	test('uses the standard fetch for disabled preference and other hosts', async () => {
		const original = globalThis.fetch;
		const seen: string[] = [];
		globalThis.fetch = async input => { seen.push(String(input)); return new Response('{}'); };
		try {
			await fetchLocalClientMcp(url, false, 1000, 10000);
			await fetchLocalClientMcp(new URL('http://example.test/health'), true, 1000, 10000);
			assert.deepEqual(seen, [url.toString(), 'http://example.test/health']);
			assert.equal(calls, 0);
		} finally { globalThis.fetch = original; }
	});
});
