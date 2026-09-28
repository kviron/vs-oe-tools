import * as assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { ensureBundledSkills } from '../features/ai/agentSkillUpdates';

suite('Agent skill automatic installation', () => {
	test('installs missing skills and preserves an existing user skill', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'vc-ve-skill-'));
		const first = path.join(directory, 'first');
		const second = path.join(directory, 'second');
		const custom = path.join(second, '.agents', 'skills', 'east-express', 'SKILL.md');
		mkdirSync(path.dirname(custom), { recursive: true });
		writeFileSync(custom, 'user-owned skill');
		try {
			const state = new Map<string, unknown>();
			const context = {
				extensionUri: vscode.Uri.file(path.resolve(__dirname, '../..')),
				workspaceState: {
					get: (key: string) => state.get(key),
					update: async (key: string, value: unknown) => { state.set(key, value); },
				},
			} as unknown as vscode.ExtensionContext;
			const folders = [first, second].map((folder, index) => ({ uri: vscode.Uri.file(folder), name: String(index), index }));
			await ensureBundledSkills(context, folders);
			assert.match(readFileSync(path.join(first, '.agents', 'skills', 'east-express', 'SKILL.md'), 'utf8'), /Completed task history/);
			assert.match(readFileSync(path.join(first, '.claude', 'skills', 'east-express', 'SKILL.md'), 'utf8'), /Completed task history/);
			assert.equal(readFileSync(custom, 'utf8'), 'user-owned skill');
			assert.match(readFileSync(path.join(second, '.claude', 'skills', 'east-express', 'SKILL.md'), 'utf8'), /Completed task history/);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
