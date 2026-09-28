import * as vscode from 'vscode';
import { KnowledgeHistoryPanel } from './view';

/** Owns the Activity Bar entry and editor panel for local task and knowledge history. */
export function registerKnowledgeHistory(context: vscode.ExtensionContext): void {
	const panel = new KnowledgeHistoryPanel(context.extensionUri,
		vscode.Uri.joinPath(context.globalStorageUri, 'work-history.sqlite').fsPath);
	const item = new vscode.TreeItem('Открыть знания и историю');
	item.iconPath = new vscode.ThemeIcon('book');
	item.command = { command: 'vc-ve-tools.openKnowledgeHistory', title: 'Открыть знания и историю' };
	const view = vscode.window.createTreeView('vc-ve-tools.knowledgeHistoryLauncher', {
		treeDataProvider: { getTreeItem: element => element, getChildren: () => [item] },
		showCollapseAll: false,
	});
	const open = async () => {
		panel.show();
		await vscode.commands.executeCommand('workbench.action.closeSidebar');
	};
	context.subscriptions.push(panel, view,
		vscode.commands.registerCommand('vc-ve-tools.openKnowledgeHistory', open),
		view.onDidChangeVisibility(event => { if (event.visible) { void open(); } }),
	);
	if (view.visible) { void open(); }
}
