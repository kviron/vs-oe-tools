import * as assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { callClientMcpTool, getClientMcpHealth, listClientMcpTools, stopClientMcpServer } from '../mcp/client/http';

suite('East Express client HTTP MCP', () => {
	let server: Server;
	let baseUrl: string;
	let lastToolCallMethod: string | undefined;
	let lastStopMethod: string | undefined;
	let codeFileEnabled = false;
	let codeFileFailure = false;
	let advertisedTemp = tmpdir();
	let toolCallCount = 0;
	let lastCodeFile: string | undefined;
	let lastToolUrl = '';

	setup(() => {
		codeFileEnabled = false;
		codeFileFailure = false;
		advertisedTemp = tmpdir();
		toolCallCount = 0;
		lastCodeFile = undefined;
	});

	suiteSetup(async () => {
		server = createServer(async (request, response) => {
			const url = new URL(request.url ?? '/', 'http://localhost');
			if (request.method !== 'GET') {
				response.statusCode = 501;
				response.end();
				return;
			}
			response.setHeader('content-type', 'application/json; charset=utf-8');
			if (url.pathname === '/health') {
				response.end(JSON.stringify({ status: 'ok', database: 'oetrunk',
					...(codeFileEnabled ? { methodCodeFile: 'vcve-code-file-v1', tempDirectory: advertisedTemp } : {}),
				}));
				return;
			}
			if (url.pathname === '/stop') {
				lastStopMethod = request.method;
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
				toolCallCount++;
				lastToolUrl = request.url ?? '';
				lastToolCallMethod = request.method;
				const name = url.searchParams.get('name');
				const argumentsValue = JSON.parse(url.searchParams.get('arguments') ?? '{}') as Record<string, unknown>;
				const token = url.searchParams.get('codeToken');
				if (token) {
					assert.match(token, /^[0-9a-f]{32}$/);
					lastCodeFile = path.join(tmpdir(), `vcve-mcp-code-${token}.json`);
					if (codeFileFailure) {
						response.statusCode = 500;
						response.end(JSON.stringify({ error: 'native failure' }));
						return;
					}
					const payload = JSON.parse(await readFile(lastCodeFile, 'utf8'));
					assert.equal(payload.protocol, 'vcve-code-file-v1');
					assert.equal(payload.Member, argumentsValue.Member);
					assert.equal(argumentsValue.Code, undefined);
					await rm(lastCodeFile);
					response.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(payload) }] }));
					return;
				}
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
		assert.equal(lastStopMethod, 'GET');
	});

	test('sends the tool name and JSON arguments through the native GET contract', async () => {
		const result = await callClientMcpTool('validate_sql', { Query: 'SELECT 1' }, baseUrl);
		assert.deepEqual(result, { content: [{ type: 'text', text: 'validate_sql:SELECT 1' }] });
		assert.equal(lastToolCallMethod, 'GET');
	});

	test('rejects arguments that are too large for a URL', async () => {
		const query = 'Ж'.repeat(20_000);
		await assert.rejects(() => callClientMcpTool('validate_sql', { Query: query }, baseUrl), /слишком велики/);
	});

	test('preserves Cyrillic and reserved characters in GET arguments', async () => {
		const query = "SELECT 'Привет & + ? # = %'";
		const result = await callClientMcpTool('validate_sql', { Query: query }, baseUrl);
		assert.deepEqual(result, { content: [{ type: 'text', text: `validate_sql:${query}` }] });
	});

	test('transfers large method code losslessly with a short GET and removes the file', async () => {
		codeFileEnabled = true;
		const Code = "// Привет 😀 & + ? # = % 00123\r\n".repeat(1200);
		const result = await callClientMcpTool('class_method_change', { Member: '3200176', Code }, baseUrl);
		assert.deepStrictEqual(JSON.parse(result.content[0].text), { protocol: 'vcve-code-file-v1', Member: '3200176', Code });
		assert.equal(lastToolCallMethod, 'GET');
		assert.ok(lastToolUrl.length < 1000);
		assert.ok(!lastToolUrl.includes('Привет'));
		assert.equal(toolCallCount, 1);
		assert.ok(lastCodeFile);
		assert.equal(await stat(lastCodeFile!).catch(() => undefined), undefined);
	});

	test('accepts a numeric member ID when transferring large method code', async () => {
		codeFileEnabled = true;
		const Code = 'begin\r\n // Большой исходник\r\nend;\r\n'.repeat(1000);
		const result = await callClientMcpTool('class_method_change', { Member: 3200176, Code }, baseUrl);
		assert.deepStrictEqual(JSON.parse(result.content[0].text), {
			protocol: 'vcve-code-file-v1',
			Member: '3200176',
			Code,
		});
		assert.ok(lastToolUrl.includes('%223200176%22'));
		assert.equal(toolCallCount, 1);
	});

	test('requires native capability before sending a large method mutation', async () => {
		await assert.rejects(() => callClientMcpTool('class_method_change', { Member: '3200176', Code: 'x'.repeat(20000) }, baseUrl), /12464784/);
		assert.equal(toolCallCount, 0);
		assert.equal(lastCodeFile, undefined);
	});

	test('rejects oversized files and extra arguments before invoking a tool', async () => {
		codeFileEnabled = true;
		await assert.rejects(() => callClientMcpTool('class_method_change', { Member: '3200176', Code: 'x'.repeat(2 * 1024 * 1024) }, baseUrl), /2 МБ/);
		await assert.rejects(() => callClientMcpTool('class_method_change', { Member: '3200176', Code: 'x'.repeat(20000), extra: true }, baseUrl), /слишком велики/);
		assert.equal(toolCallCount, 0);
	});

	test('rejects a different native temp directory without writing or invoking', async () => {
		codeFileEnabled = true;
		advertisedTemp = process.cwd();
		await assert.rejects(() => callClientMcpTool('class_method_change', { Member: '3200176', Code: 'x'.repeat(20000) }, baseUrl), /каталоги/);
		assert.equal(toolCallCount, 0);
		assert.equal(lastCodeFile, undefined);
	});

	test('cleans up an unconsumed file after failure without retrying the mutation', async () => {
		codeFileEnabled = true;
		codeFileFailure = true;
		await assert.rejects(() => callClientMcpTool('class_method_change', { Member: '3200176', Code: 'x'.repeat(20000) }, baseUrl), /перед повтором перечитайте метод/);
		assert.equal(toolCallCount, 1);
		assert.ok(lastCodeFile);
		assert.equal(await stat(lastCodeFile!).catch(() => undefined), undefined);
	});

	test('reports an unreachable client server with its address', async () => {
		await assert.rejects(
			() => listClientMcpTools('http://127.0.0.1:1'),
			/Клиентский MCP недоступен по адресу http:\/\/127\.0\.0\.1:1/,
		);
	});
});
