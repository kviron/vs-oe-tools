import * as assert from 'node:assert/strict';
import { ClientMcpLifecycleManager, type ClientMcpLifecycleDependencies } from '../mcp/clientMcpLifecycleManager';

suite('Client MCP lifecycle manager', () => {
	function createDependencies() {
		let online = false;
		let starts = 0;
		let stops = 0;
		let timerCallback: (() => void) | undefined;
		const dependencies: ClientMcpLifecycleDependencies = {
			getHealth: async () => { if (!online) { throw new Error('offline'); } },
			start: async () => { starts += 1; online = true; },
			stop: async () => { stops += 1; online = false; },
			setTimer: callback => { timerCallback = callback; return { unref: () => undefined } as unknown as ReturnType<typeof setTimeout>; },
			clearTimer: () => { timerCallback = undefined; },
		};
		return { dependencies, setOnline: (value: boolean) => { online = value; }, getStarts: () => starts, getStops: () => stops, fireTimer: () => timerCallback?.() };
	}

	test('starts on first use and stops its own server after idle timeout', async () => {
		const fixture = createDependencies();
		const manager = new ClientMcpLifecycleManager(fixture.dependencies, 1);
		assert.equal(await manager.run(async () => 'result'), 'result');
		assert.equal(fixture.getStarts(), 1);
		fixture.fireTimer();
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(fixture.getStops(), 1);
	});

	test('does not stop a server that was already running', async () => {
		const fixture = createDependencies();
		fixture.setOnline(true);
		const manager = new ClientMcpLifecycleManager(fixture.dependencies, 1);
		await manager.run(async () => undefined);
		fixture.fireTimer();
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(fixture.getStarts(), 0);
		assert.equal(fixture.getStops(), 0);
	});

	test('shares one startup across concurrent calls', async () => {
		let online = false;
		let starts = 0;
		let releaseStart: (() => void) | undefined;
		const dependencies: ClientMcpLifecycleDependencies = {
			getHealth: async () => { if (!online) { throw new Error('offline'); } },
			start: async () => { starts += 1; await new Promise<void>(resolve => { releaseStart = resolve; }); online = true; },
			stop: async () => undefined,
			setTimer: () => ({ unref: () => undefined }) as unknown as ReturnType<typeof setTimeout>,
			clearTimer: () => undefined,
		};
		const manager = new ClientMcpLifecycleManager(dependencies, 1);
		const first = manager.run(async () => 1);
		const second = manager.run(async () => 2);
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(starts, 1);
		releaseStart?.();
		assert.deepEqual(await Promise.all([first, second]), [1, 2]);
	});
});
