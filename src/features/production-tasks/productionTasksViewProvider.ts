import * as vscode from 'vscode';
import type { ProductionTasksHostMessage } from '../../core/webviewProtocol';
import { isProductionTasksWebviewMessage } from '../../core/webviewProtocol';
import type { ProductionConnectionOptions, ProductionTasksLogger, ProductionTaskSummary } from './models';
import { loadProductionTasks } from './productionTasksRepository';

export class ProductionTasksPanelManager implements vscode.Disposable {
	static readonly viewType = 'vc-ve-tools.productionTasks';
	private panel?: vscode.WebviewPanel;
	private tasks = new Map<number, ProductionTaskSummary>();
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly getOptions: () => Promise<ProductionConnectionOptions>,
		private readonly openTask: (task: ProductionTaskSummary) => void,
		private readonly importSessionKey: () => Promise<boolean>,
		private readonly setPassword: () => Promise<boolean>,
		private readonly logger: ProductionTasksLogger,
		private readonly openLog: () => void,
	) {}
	show(): void {
		if (this.panel) { this.panel.reveal(vscode.ViewColumn.Active, false); return; }
		const panel = vscode.window.createWebviewPanel(
			ProductionTasksPanelManager.viewType,
			'Задачи',
			vscode.ViewColumn.Active,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		this.panel = panel;
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		panel.webview.html = shell(panel.webview, assetsRoot);
		panel.webview.onDidReceiveMessage((message: unknown) => {
			if (!isProductionTasksWebviewMessage(message)) { return; }
			if (message.command === 'copyTableCells') { void vscode.env.clipboard.writeText(message.text); return; }
			if (message.command === 'tableSelectionDebug') { return; }
			if (message.command === 'openProductionTask') { const task = this.tasks.get(message.id); if (task) { this.openTask(task); } return; }
			if (message.command === 'importProductionSessionKey') { void this.importSessionKey().then(imported => { if (imported) { void this.refresh(); } }); return; }
			if (message.command === 'setProductionTasksPassword') { void this.setPassword().then(changed => { if (changed) { void this.refresh(); } }); return; }
			if (message.command === 'openProductionTasksLog') { this.openLog(); return; }
			void this.refresh();
		});
		panel.onDidDispose(() => { this.panel = undefined; this.tasks.clear(); });
	}
	async refresh(): Promise<void> {
		await this.post({ command: 'productionTasksLoading' });
		this.logger.info('Панель запросила обновление списка задач.');
		try {
			const tasks = await loadProductionTasks(await this.getOptions(), this.logger);
			this.tasks = new Map(tasks.map(task => [task.id, task]));
			await this.post({ command: 'productionTasksLoaded', tasks, loadedAt: new Date().toISOString() });
		} catch (error) {
			this.logger.error('Не удалось обновить список задач.', error);
			await this.post({ command: 'productionTasksFailed', message: error instanceof Error ? error.message : String(error) });
		}
	}
	dispose(): void { this.panel?.dispose(); this.tasks.clear(); }
	private async post(message: ProductionTasksHostMessage): Promise<void> { await this.panel?.webview.postMessage(message); }
}

export function registerProductionTasksActivityLauncher(panel: ProductionTasksPanelManager): vscode.Disposable {
	const item = new vscode.TreeItem('Открыть таблицу задач');
	item.iconPath = new vscode.ThemeIcon('list-selection');
	item.command = { command: 'vc-ve-tools.openProductionTasks', title: 'Открыть таблицу задач' };
	const view = vscode.window.createTreeView('vc-ve-tools.productionTasksLauncher', {
		treeDataProvider: {
			getTreeItem: element => element,
			getChildren: () => [item],
		},
		showCollapseAll: false,
	});
	const openFromActivityBar = async (): Promise<void> => {
		panel.show();
		await vscode.commands.executeCommand('workbench.action.closeSidebar');
	};
	const visibility = view.onDidChangeVisibility(event => { if (event.visible) { void openFromActivityBar(); } });
	if (view.visible) { void openFromActivityBar(); }
	return vscode.Disposable.from(view, visibility);
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-tasks.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-tasks.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задачи</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
