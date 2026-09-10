import * as assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { getPostmanApiHealth, stopPostmanApiServer } from '../features/postman/postmanApiHttp';

suite('Postman API HTTP status', () => {
	let server: Server;
	let baseUrl: string;

	suiteSetup(async () => {
		server = createServer((request, response) => {
			response.setHeader('content-type', 'application/json; charset=utf-8');
			if (request.url === '/api/health') {
				response.end(JSON.stringify({ status: 'ok', database: 'oetest' }));
				return;
			}
			if (request.url === '/api/stop') {
				response.end(JSON.stringify({ status: 'stopping' }));
				return;
			}
			response.statusCode = 404;
			response.end(JSON.stringify({ error: 'Unknown endpoint' }));
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		if (!address || typeof address === 'string') { throw new Error('Test HTTP server did not start.'); }
		baseUrl = `http://127.0.0.1:${address.port}/api`;
	});

	suiteTeardown(async () => {
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});

	test('reads status and active database', async () => {
		assert.deepEqual(await getPostmanApiHealth(baseUrl), { status: 'ok', database: 'oetest' });
	});

	test('stops only the Postman API endpoint', async () => {
		await stopPostmanApiServer(baseUrl);
	});

	test('reports an unavailable endpoint with its base URL', async () => {
		await assert.rejects(() => getPostmanApiHealth('http://127.0.0.1:1/api'), /127\.0\.0\.1:1\/api/u);
	});
});
