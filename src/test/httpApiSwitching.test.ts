import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { computed, ref } from '@vue/reactivity';
import { parseHttpMethodDocumentation } from '../features/http-api/httpParameterDocumentation';

// Exercise the actual panel script with Vue reactivity and a deterministic host/timer bridge.
function panelHarness(runningMethod?: string, selectedItem: unknown = null, mode: 'http' | 'direct' = 'http') {
	const source = readFileSync(path.resolve(__dirname, '../../webview-ui/src/http-api/App.vue'), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
	const parsed = ts.createSourceFile('panel.ts', source, ts.ScriptTarget.ES2022, true);
	const withoutImports = ts.createPrinter().printFile(ts.factory.updateSourceFile(parsed, parsed.statements.filter(statement => !ts.isImportDeclaration(statement))));
	const script = ts.transpileModule(withoutImports + '\nglobalThis.panel = { chooseMethod, startServer, stopServer, sendGeneratedRequest, selectedMethodName, generatedRequest, serverChanging, scrollToSelectedMethod, methodPickerOpen, executionMode, parameters, parseParameters, loadHistoryEntry };', {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
	}).outputText;
	const sent: Array<{ command: string; methodName?: string; parameters?: Record<string, string> }> = [];
	const timers = new Set<() => void>();
	let receive!: (event: { data: unknown }) => void;
	const context = {
		ref, computed, parseHttpMethodDocumentation, URL, exports: {},
		nextTick: () => Promise.resolve(),
		requestAnimationFrame: (callback: () => void) => callback(),
		document: { querySelector: () => selectedItem },
		onBeforeUnmount: () => undefined,
		setTimeout: (callback: () => void) => { timers.add(callback); return callback; },
		clearTimeout: (callback: () => void) => timers.delete(callback),
		window: { addEventListener: (_name: string, listener: typeof receive) => { receive = listener; } },
		vscode: { getState: () => undefined, setState: () => undefined, postMessage: (message: typeof sent[number]) => sent.push(message) },
		panel: undefined as unknown as {
			chooseMethod(name: string): void; startServer(): void; stopServer(): void; sendGeneratedRequest(): void;
			selectedMethodName: { value: string }; generatedRequest: { value: unknown }; serverChanging: { value: boolean };
			executionMode: { value: 'http' | 'direct' }; parameters: { value: Array<Record<string, unknown>> };
			parseParameters(signature: string, description: string): Array<Record<string, unknown>>;
			loadHistoryEntry(entry: unknown): void;
			scrollToSelectedMethod(): Promise<void>; methodPickerOpen: { value: boolean };
		},
	};
	runInNewContext(script, context);
	context.panel.executionMode.value = mode;
	const update = (methodName?: string) => receive({ data: { command: 'settingsState', state: {
		httpMethods: ['A', 'B', 'C', 'АнкетыСписок'].map((name, id) => ({ id, name, signature: '(): string', description: '' })),
		httpTestServer: methodName ? { methodName, url: 'http://127.0.0.1:18081/api', database: 'test' } : undefined,
	} } });
	update(runningMethod);
	return {
		...context.panel, sent, update,
		tick: () => { const pending = [...timers]; timers.clear(); pending.forEach(callback => callback()); },
		finish: (methodName?: string, success = true) => {
			update(methodName);
			receive({ data: { command: 'httpTestServerActionFinished', action: 'start', success, message: success ? '' : 'start failed' } });
		},
		finishRequest: () => receive({ data: { command: 'httpApiRequestFinished', success: false, message: 'test request completed' } }),
		starts: () => sent.filter(message => message.command === 'startHttpTestServer').map(message => message.methodName),
	};
}

suite('HTTP API automatic method switching', () => {
	test('direct calls require no server and preserve strings, int64 IDs, JSON and disabled defaults', () => {
		const panel = panelHarness(undefined, null, 'direct');
		panel.chooseMethod('АнкетыСписок');
		panel.parameters.value = panel.parseParameters('(code: string; id: Int64; options: APIПараметр = nil; unused: Integer = 5): string', '');
		panel.parameters.value[0].value = '00123';
		panel.parameters.value[1].value = '9223372036854775807';
		panel.parameters.value[2].enabled = true;
		panel.parameters.value[2].value = '{"name":"Тест 😀"}';
		panel.parameters.value[3].enabled = false;
		panel.sendGeneratedRequest(); panel.sendGeneratedRequest(); panel.tick();
		assert.deepEqual(panel.starts(), []);
		const requests = panel.sent.filter(message => message.command === 'executeDirectHttpMethod');
		assert.equal(requests.length, 1);
		assert.equal(JSON.stringify(requests[0].parameters), JSON.stringify({ code: '00123', id: '9223372036854775807', 'options.json': '{"name":"Тест 😀"}' }));
	});

	test('direct history restores the method form and does not execute it', () => {
		const panel = panelHarness();
		panel.loadHistoryEntry({ request: { direct: { methodName: 'B', parameters: {} } } });
		assert.equal(panel.executionMode.value, 'direct');
		assert.equal(panel.selectedMethodName.value, 'B');
		assert.deepEqual(panel.starts(), []);
		assert.equal(panel.sent.some(message => message.command === 'executeDirectHttpMethod'), false);
	});

	test('centers the selected method in the inner list each time the picker opens', async () => {
		const list = { scrollTop: 0, clientHeight: 300, offsetHeight: 300, getBoundingClientRect: () => ({ top: 100, height: 300 }) };
		const item = { offsetHeight: 50, getBoundingClientRect: () => ({ top: 1000 - list.scrollTop }), closest: () => list };
		const panel = panelHarness('АнкетыСписок', item);
		panel.methodPickerOpen.value = true;
		await panel.scrollToSelectedMethod();
		assert.equal(list.scrollTop, 775);
		list.scrollTop = 0;
		await panel.scrollToSelectedMethod();
		assert.equal(list.scrollTop, 775);
		panel.methodPickerOpen.value = false;
		list.scrollTop = 0;
		await panel.scrollToSelectedMethod();
		assert.equal(list.scrollTop, 0);
	});

	test('opening an empty method list does not fail', async () => {
		const panel = panelHarness();
		panel.methodPickerOpen.value = true;
		await panel.scrollToSelectedMethod();
	});

	test('compensates for the popover zoom animation when scrolling', async () => {
		const list = { scrollTop: 0, clientHeight: 300, offsetHeight: 300, getBoundingClientRect: () => ({ top: 100, height: 285 }) };
		const item = { offsetHeight: 50, getBoundingClientRect: () => ({ top: 100 + 900 * 0.95 }), closest: () => list };
		const panel = panelHarness('АнкетыСписок', item);
		panel.methodPickerOpen.value = true;
		await panel.scrollToSelectedMethod();
		assert.equal(list.scrollTop, 775);
	});

	test('restores the running method without a restart; selecting while stopped does not launch', () => {
		const running = panelHarness('АнкетыСписок');
		assert.equal(running.selectedMethodName.value, 'АнкетыСписок');
		running.tick();
		assert.deepEqual(running.starts(), []);
		const stopped = panelHarness();
		stopped.chooseMethod('B'); stopped.tick();
		assert.deepEqual(stopped.starts(), []);
	});

	test('coalesces rapid choices and blocks requests until the selected server is ready', () => {
		const panel = panelHarness('A');
		panel.chooseMethod('B'); panel.chooseMethod('АнкетыСписок');
		assert.equal(panel.generatedRequest.value, undefined);
		panel.sendGeneratedRequest(); panel.tick();
		assert.deepEqual(panel.starts(), ['АнкетыСписок']);
		assert.equal(panel.sent.some(message => message.command === 'executeHttpApiRequest'), false);
		panel.finish('АнкетыСписок');
		assert.ok(panel.generatedRequest.value);
	});

	test('remembers only the latest choice while a startup is in flight', () => {
		const panel = panelHarness('A');
		panel.chooseMethod('B'); panel.tick();
		panel.chooseMethod('C'); panel.chooseMethod('АнкетыСписок'); panel.tick();
		assert.deepEqual(panel.starts(), ['B']);
		panel.finish('B');
		assert.deepEqual(panel.starts(), ['B', 'АнкетыСписок']);
		panel.finish('АнкетыСписок');
		assert.equal(panel.serverChanging.value, false);
	});

	test('waits for an active request before switching its server', () => {
		const panel = panelHarness('A');
		panel.sendGeneratedRequest();
		panel.chooseMethod('B'); panel.tick();
		assert.deepEqual(panel.starts(), []);
		panel.finishRequest();
		assert.deepEqual(panel.starts(), ['B']);
	});

	test('stop cancels a queued switch and a failed start can be retried explicitly', () => {
		const panel = panelHarness('A');
		panel.chooseMethod('B'); panel.stopServer(); panel.tick();
		assert.deepEqual(panel.starts(), []);
		assert.equal(panel.sent.at(-1)?.command, 'stopHttpTestServer');
		panel.finish();
		panel.startServer(); panel.finish(undefined, false); panel.tick();
		assert.deepEqual(panel.starts(), ['B']);
		assert.equal(panel.generatedRequest.value, undefined);
		panel.startServer(); panel.finish('B');
		assert.ok(panel.generatedRequest.value);
	});
});
