import * as assert from 'node:assert/strict';
import { HttpServerLifecycle } from '../features/http-api/httpServerLifecycle';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

suite('HTTP server lifecycle', () => {
	test('waits for the old process to stop before starting the next', async () => {
		const lifecycle = new HttpServerLifecycle();
		const stopped = deferred();
		const stopping = deferred();
		const events: string[] = [];
		await lifecycle.replace(async () => ({ stop: async () => { events.push('stop A'); stopping.resolve(); await stopped.promise; } }));
		const next = { stop: async () => undefined };
		const switching = lifecycle.replace(async () => { events.push('start B'); return next; });
		await stopping.promise;
		assert.deepEqual(events, ['stop A']);
		stopped.resolve();
		await switching;
		assert.deepEqual(events, ['stop A', 'start B']);
		assert.equal(lifecycle.server, next);
	});

	test('a stop during startup cleans up the process once it starts', async () => {
		const lifecycle = new HttpServerLifecycle();
		const starting = deferred();
		const ready = deferred();
		let stops = 0;
		const start = lifecycle.replace(async () => {
			starting.resolve();
			await ready.promise;
			return { stop: async () => { stops++; } };
		});
		await starting.promise;
		const stop = lifecycle.replace();
		ready.resolve();
		await Promise.all([start, stop]);
		assert.equal(stops, 1);
		assert.equal(lifecycle.server, undefined);
	});

	test('clears a stopped server on startup failure and allows retry', async () => {
		const lifecycle = new HttpServerLifecycle();
		await lifecycle.replace(async () => ({ stop: async () => undefined }));
		await assert.rejects(lifecycle.replace(async () => { throw new Error('start failed'); }), /start failed/);
		assert.equal(lifecycle.server, undefined);
		const retry = { stop: async () => undefined };
		await lifecycle.replace(async () => retry);
		assert.equal(lifecycle.server, retry);
	});

	test('does not start a second process when stopping the old one fails', async () => {
		const lifecycle = new HttpServerLifecycle();
		const old = { stop: async () => { throw new Error('stop failed'); } };
		await lifecycle.replace(async () => old);
		let starts = 0;
		await assert.rejects(lifecycle.replace(async () => { starts++; return old; }), /stop failed/);
		assert.equal(starts, 0);
		assert.equal(lifecycle.server, old);
	});
});
