import * as assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import { callClientMcpTool, getClientMcpHealth, listClientMcpTools, stopClientMcpServer } from '../mcp/clientMcpHttp';

suite('East Express client HTTP MCP', () => {
	let server: Server;
	let baseUrl: string;

	suiteSetup(async () => {
		server = createServer((request, response) => {
			const url = new URL(request.url ?? '/', 'http://localhost');
			response.setHeader('content-type', 'application/json; charset=utf-8');
			if (url.pathname === '/health') {
				response.end(JSON.stringify({ status: 'ok', database: 'oetrunk' }));
				return;
			}
			if (url.pathname === '/stop') {
				response.end(JSON.stringify({ status: 'stopping' }));
				return;
			}
			if (url.pathname === '/tools/list') {
				response.end(JSON.stringify({ tools: [{
					name: 'validate_sql',
					description: 'Validate SQL',
					inputSchema: { type: 'object', properties: { Query: { type: 'string' } } },
					required: ['Query'],
					source: 12463427,
				}] }));
				return;
			}
			if (url.pathname === '/tools/call') {
				const name = url.searchParams.get('name');
				const argumentsValue = JSON.parse(url.searchParams.get('arguments') ?? '{}') as Record<string, unknown>;
				response.end(JSON.stringify({ content: [{ type: 'text', text: `${name}:${String(argumentsValue.Query)}` }] }));
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
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	suiteTeardown(async () => {
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});

	test('loads the live client tool catalog', async () => {
		const tools = await listClientMcpTools(baseUrl);
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, 'validate_sql');
		assert.deepEqual(tools[0].required, ['Query']);
	});

	test('reads the client health endpoint', async () => {
		assert.deepStrictEqual(await getClientMcpHealth(baseUrl), { status: 'ok', database: 'oetrunk' });
	});

	test('requests shutdown through the client HTTP endpoint', async () => {
		await stopClientMcpServer(baseUrl);
	});

	test('passes the tool name and JSON arguments through query parameters', async () => {
		const result = await callClientMcpTool('validate_sql', { Query: 'SELECT 1' }, baseUrl);
		assert.deepEqual(result, { content: [{ type: 'text', text: 'validate_sql:SELECT 1' }] });
	});

	test('reports an unreachable client server with its address', async () => {
		await assert.rejects(
			() => listClientMcpTools('http://127.0.0.1:1'),
			/Клиентский MCP недоступен по адресу http:\/\/127\.0\.0\.1:1/,
		);
	});
});
