import * as assert from 'node:assert/strict';
import { buildDirectHttpMethodArguments, encodeDirectHttpMethodRequest, parseDirectHttpMethodResponse, runDirectProcess, validateDirectHttpMethodRequest } from '../features/http-api/directHttpMethod';
import { isSettingsWebviewMessage } from '../core/webviewProtocol';

suite('Direct HTTP method execution', () => {
	test('encodes lossless ASCII JSON without coercing strings, IDs or nested JSON', () => {
		const request = { methodName: 'АнкетыСписок', parameters: { id: '9223372036854775807', code: '00123', 'arg.json': '{"text":"Привет 😀"}', empty: '' } };
		const encoded = encodeDirectHttpMethodRequest(request);
		assert.match(encoded, /^[\x00-\x7f]*$/u);
		const decoded = JSON.parse(encoded);
		assert.equal(decoded.methodName, request.methodName);
		assert.deepEqual(Object.fromEntries(decoded.parameters.map((p: {name: string; value: string}) => [p.name, p.value])), request.parameters);
	});
	test('uses shell-free argv and puts parameter values in files, not the command line', () => {
		const args = buildDirectHttpMethodArguments({ methodName: 'АнкетыСписок', parameters: { secret: 'not-on-command-line' } }, 'test', 'localhost', { username: 'dev', password: 'pwd' }, 'C:\\Project Space\\request.json', 'C:\\Project Space\\response.json');
		assert.ok(args.includes('-MethodID=3200176'));
		assert.ok(args.some(arg => arg.includes('requestFile=C:\\Project Space\\request.json')));
		assert.equal(args.join(' ').includes('not-on-command-line'), false);
	});
	test('validates unknown input and webview parameter shapes', () => {
		for (const input of [null, {}, {methodName:'*',parameters:{}}, {methodName:'x',parameters:[]}, {methodName:'x',parameters:{id:123}}]) {
			assert.throws(() => validateDirectHttpMethodRequest(input));
			assert.equal(isSettingsWebviewMessage({command:'executeDirectHttpMethod', ...(input as object)}), false);
		}
		assert.equal(isSettingsWebviewMessage({ command:'executeDirectHttpMethod',methodName:'A',parameters:{x:'0'} }), true);
	});
	test('distinguishes direct results from HTTP and rejects broken or failed envelopes', () => {
		const parse = (envelope: unknown) => parseDirectHttpMethodResponse(Buffer.from(JSON.stringify(envelope)), 42);
		const result = parse({ protocol:'vcve-direct-v1',ok:true,body:'{"result":"Тест 😀"}' });
		assert.equal(result.execution, 'direct'); assert.equal(result.status, 0); assert.deepEqual(result.headers, {});
		assert.throws(() => parse({protocol:'vcve-direct-v1',ok:false,error:'Missing parameter'}), /Missing parameter/);
		assert.throws(() => parse({ok:true,body:'{}'}), /Несовместимая/);
		assert.throws(() => parse({protocol:'vcve-direct-v1',ok:true,body:'not json'}));
	});
	test('waits for normal process completion and reports failures without retries', async () => {
		await runDirectProcess(process.execPath, ['-e', 'process.exit(0)'], process.cwd());
		await assert.rejects(runDirectProcess(process.execPath, ['-e', 'process.exit(7)'], process.cwd()), /кодом 7/);
	});
	test('terminates a timed-out process and accepts pre-launch cancellation', async () => {
		await assert.rejects(runDirectProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], process.cwd(), undefined, 80), /не завершился/);
		const controller = new AbortController(); controller.abort();
		await assert.rejects(runDirectProcess(process.execPath, [], process.cwd(), controller.signal), /до запуска/);
	});
});
