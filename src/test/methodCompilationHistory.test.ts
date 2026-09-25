import * as assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MethodCompilationHistory, type MethodCompilationRecord } from '../features/methods/methodCompilationHistory';

suite('Method compilation history', () => {
	test('persists checks and returns recent records for one method', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'vcve-compilation-'));
		try {
			const filePath = join(directory, 'history.jsonl');
			const history = new MethodCompilationHistory(filePath);
			const record = (methodId: number, message: string): MethodCompilationRecord => ({
				timestamp: '2026-09-23T00:00:00.000Z', methodId, database: 'oetrunk', host: 'localhost', source: 'agent',
				status: 'diagnostics', passed: false, errorCount: 1, warningCount: 0,
				diagnostics: [{ line: 3, severity: 'error', message }],
			});
			await Promise.all([history.append(record(101, 'first')), history.append(record(102, 'other')),
				history.append(record(101, 'latest'))]);
			const reopened = new MethodCompilationHistory(filePath);
			assert.deepEqual((await reopened.recent(101, 1)).map(item => item.diagnostics[0].message), ['latest']);
			assert.deepEqual((await reopened.recent()).map(item => item.methodId), [101, 102, 101]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
