import * as assert from 'assert';
import * as http from 'http';
import { executeHttpApiRequest } from '../features/http-api/httpApiRequest';

suite('HTTP API request', () => {
	test('sends JSON and returns response metadata', async () => {
		const server = http.createServer((request, response) => {
			let body = '';
			request.setEncoding('utf8');
			request.on('data', chunk => { body += chunk; });
			request.on('end', () => {
				response.writeHead(201, { 'content-type': 'application/json; charset=utf-8', 'set-cookie': ['session=one; HttpOnly', 'theme=dark'], 'x-request-method': request.method ?? '' });
				response.end(JSON.stringify({ body }));
			});
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		try {
			const address = server.address();
			if (!address || typeof address === 'string') { throw new Error('Test server did not start.'); }
			const result = await executeHttpApiRequest({
				method: 'POST',
				url: `http://127.0.0.1:${address.port}/items`,
				headers: { 'content-type': 'application/json' },
				body: '{"name":"test"}',
			});
			assert.equal(result.status, 201);
			assert.equal(result.headers['x-request-method'], 'POST');
			assert.deepStrictEqual(JSON.parse(result.body), { body: '{"name":"test"}' });
			assert.equal(result.bodySizeBytes, Buffer.byteLength(result.body, 'utf8'));
			assert.equal(result.contentType, 'application/json; charset=utf-8');
			assert.equal(result.url, `http://127.0.0.1:${address.port}/items`);
			assert.equal(result.redirected, false);
			assert.deepStrictEqual(result.cookies, ['session=one; HttpOnly', 'theme=dark']);
		} finally {
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});

	test('rejects non-http URLs', async () => {
		await assert.rejects(() => executeHttpApiRequest({ method: 'GET', url: 'file:///secret.txt' }), /только http:\/\//i);
	});
});
