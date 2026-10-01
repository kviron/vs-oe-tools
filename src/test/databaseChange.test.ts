import * as assert from 'assert';
import type * as vscode from 'vscode';
import { createDatabaseChangeHandler } from '../application/databaseChange';

const change = (key: string): vscode.ConfigurationChangeEvent => ({
	affectsConfiguration: section => section === key,
});

suite('Database change lifecycle', () => {
	for (const key of ['vcVeTools.databaseRole', 'vcVeTools.databaseProfile']) {
		test(`publishes selection before sequential feature invalidation: ${key}`, async () => {
			const calls: string[] = [];
			let release!: () => void;
			const pending = new Promise<void>(resolve => { release = resolve; });
			let started!: () => void;
			const handlerStarted = new Promise<void>(resolve => { started = resolve; });
			const handler = createDatabaseChangeHandler({
				selection: {
					publishActive: async () => { calls.push('active'); },
					publishWorkspace: async () => { calls.push('workspace'); },
				},
				onDatabaseChanged: [
					async () => { calls.push('close'); started(); await pending; calls.push('closed'); },
					() => { calls.push('refresh'); },
				],
			});
			const completion = handler(change(key));
			await handlerStarted;
			assert.deepStrictEqual(calls, ['active', 'workspace', 'close']);
			release();
			await completion;
			assert.deepStrictEqual(calls, ['active', 'workspace', 'close', 'closed', 'refresh']);
		});
	}

	test('ignores unrelated configuration changes', async () => {
		const unexpected = () => { assert.fail('Unrelated setting triggered database invalidation'); };
		await createDatabaseChangeHandler({
			selection: { publishActive: async () => unexpected(), publishWorkspace: async () => unexpected() },
			onDatabaseChanged: [unexpected],
		})(change('editor.fontSize'));
	});

	test('does not invalidate features when selection publication fails', async () => {
		const failure = new Error('Selection publication failed');
		const handler = createDatabaseChangeHandler({
			selection: {
				publishActive: async () => { throw failure; },
				publishWorkspace: async () => { assert.fail('Must wait for active selection'); },
			},
			onDatabaseChanged: [() => { assert.fail('Must wait for selection publication'); }],
		});
		await assert.rejects(handler(change('vcVeTools.databaseProfile')), error => error === failure);
	});
});
