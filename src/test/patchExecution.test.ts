import * as assert from 'node:assert/strict';
import { commands } from '../features/project/commands';
import type { NavigationActions } from '../features/ai/navigationTools';

suite('Native patch command', () => {
	const input = { role: 'test', patchFile: 'output/89340/89340-hotfix.sql',
		expectedDatabase: 'oetest', expectedHost: 'localhost', expectedPort: 5432 };
	test('requires an explicit target instead of silently filling the active database', () => {
		for (const field of ['role', 'patchFile', 'expectedDatabase', 'expectedHost', 'expectedPort']) {
			const incomplete: Record<string, unknown> = { ...input };
			delete incomplete[field];
			assert.equal(commands.execute_patch.schema.safeParse(incomplete).success, false);
		}
		assert.equal(commands.execute_patch.schema.safeParse({ ...input, expectedPort: 0 }).success, false);
		assert.equal(commands.execute_patch.schema.safeParse({ ...input, packageChanges: '-arbitrary-flag' }).success, false);
		assert.equal(commands.execute_patch.schema.safeParse({ ...input, packageChanges: 'allowAndLog' }).success, true);
	});
	test('preserves the requested target and failed execution state', async () => {
		const failure = { executed: true, passed: false, mayHavePartialChanges: true, logPath: 'errors.log' };
		let calls = 0;
		const actions = { executePatch: async (received: unknown) => {
			calls++; assert.deepEqual(received, input); return failure;
		} } as unknown as NavigationActions;
		assert.deepEqual(await commands.execute_patch.execute(input, actions), failure);
		assert.equal(calls, 1);
		assert.deepEqual(commands.execute_patch.tool!.prepare(input, {
			expectedDatabase: 'oetrunk', expectedHost: 'other', expectedPort: 1234,
		}), input);
	});
});
