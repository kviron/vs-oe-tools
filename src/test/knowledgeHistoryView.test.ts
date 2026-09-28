import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Knowledge history view', () => {
	test('opens local history in the tasks editor tab', async () => {
		const extension = vscode.extensions.all.find(candidate => candidate.packageJSON.name === 'vc-ve-tools');
		assert.ok(extension);
		await extension.activate();
		await vscode.commands.executeCommand('vc-ve-tools.openKnowledgeHistory');
		try {
			for (let attempt = 0; attempt < 20 && vscode.window.tabGroups.activeTabGroup.activeTab?.label !== 'Задачи'; attempt++) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, 'Задачи');
		} finally {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
	});
});
