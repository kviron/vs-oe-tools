import * as vscode from 'vscode';
import type { ProductionTasksHostMessage } from '../../core/webviewProtocol';
import { isProductionTasksWebviewMessage } from '../../core/webviewProtocol';
import type { ProductionConnectionOptions, ProductionTasksLogger, ProductionTaskSummary } from './models';
import { loadProductionTasks } from './productionTasksRepository';

export class ProductionTasksViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	static readonly viewType = 'vc-ve-tools.productionTasks';
	private view?: vscode.WebviewView;
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
	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		view.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		view.webview.html = shell(view.webview, assetsRoot);
		view.webview.onDidReceiveMessage((message: unknown) => {
			if (!isProductionTasksWebviewMessage(message)) { return; }
			if (message.command === 'openProductionTask') { const task = this.tasks.get(message.id); if (task) { this.openTask(task); } return; }
			if (message.command === 'importProductionSessionKey') { void this.importSessionKey().then(imported => { if (imported) { void this.refresh(); } }); return; }
			if (message.command === 'setProductionTasksPassword') { void this.setPassword().then(changed => { if (changed) { void this.refresh(); } }); return; }
			if (message.command === 'openProductionTasksLog') { this.openLog(); return; }
			void this.refresh();
		});
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
	dispose(): void { this.view = undefined; this.tasks.clear(); }
	private async post(message: ProductionTasksHostMessage): Promise<void> { await this.view?.webview.postMessage(message); }
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-tasks.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-tasks.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задачи</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
