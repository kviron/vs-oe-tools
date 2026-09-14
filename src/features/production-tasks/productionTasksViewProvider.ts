import * as vscode from 'vscode';
import type { ProductionTasksHostMessage } from '../../core/webviewProtocol';
import { isProductionTasksWebviewMessage } from '../../core/webviewProtocol';
import type { ProductionConnectionOptions, ProductionTaskListItem, ProductionTasksLogger, ProductionTaskSummary } from './models';
import { loadProductionTaskById, loadProductionTaskList } from './productionTasksRepository';
import { productionTaskPublicUrl } from './productionTaskPresentation';

export class ProductionTasksPanelManager implements vscode.Disposable {
	static readonly viewType = 'vc-ve-tools.productionTasks';
	private panel?: vscode.WebviewPanel;
	private tasks = new Map<number, ProductionTaskListItem>();
	private userFilter?: string;
	private refreshPromise?: Promise<void>;
	private refreshRevision = 0;
	private tasksPublished = false;
	private openingTasks = new Set<number>();
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
			if (message.command === 'openProductionTask') { void this.openTaskById(message.id); return; }
			if (message.command === 'openProductionTaskInClient') {
				const uri = vscode.Uri.parse(productionTaskPublicUrl(message.id));
				void vscode.env.openExternal(uri);
				return;
			}
			if (message.command === 'importProductionSessionKey') { void this.importSessionKey().then(imported => { if (imported) { void this.refresh(this.userFilter, true); } }); return; }
			if (message.command === 'setProductionTasksPassword') { void this.setPassword().then(changed => { if (changed) { void this.refresh(this.userFilter, true); } }); return; }
			if (message.command === 'openProductionTasksLog') { this.openLog(); return; }
			if (message.command === 'productionTasksReady') {
				// Opening or restoring the panel always starts with the signed-in user,
				// including older webviews that send a saved all-users filter.
				this.userFilter = undefined;
				void this.refresh(undefined, true);
				return;
			}
			void this.refresh(message.userFilter);
		});
		panel.onDidDispose(() => { this.panel = undefined; this.userFilter = undefined; this.refreshRevision++; this.tasks.clear(); });
	}
	refresh(userFilter = this.userFilter, force = false): Promise<void> {
		if (this.refreshPromise && userFilter === this.userFilter && !force && !this.tasksPublished) { return this.refreshPromise; }
		this.userFilter = userFilter;
		this.refreshRevision++;
		this.refreshPromise ??= this.refreshLatest().finally(() => { this.refreshPromise = undefined; });
		return this.refreshPromise;
	}
	private async refreshLatest(): Promise<void> {
		while (this.panel) {
			const revision = this.refreshRevision;
			const panel = this.panel;
			this.tasksPublished = false;
			await this.post({ command: 'productionTasksLoading' });
			this.logger.info('Панель запросила обновление списка задач.', { userFilter: this.userFilter ?? 'current' });
			try {
				const options = await this.getOptions();
				if (revision !== this.refreshRevision || panel !== this.panel) { continue; }
				const result = await loadProductionTaskList(options, this.userFilter, this.logger, async loaded => {
					if (revision !== this.refreshRevision || panel !== this.panel) { return; }
					this.userFilter = loaded.userFilter;
					this.tasks = new Map(loaded.tasks.map(task => [task.id, task]));
					this.tasksPublished = true;
					await this.post({ command: 'productionTasksLoaded', ...loaded, loadedAt: new Date().toISOString(), currentPersonId: options.personId });
				});
				if (revision !== this.refreshRevision || panel !== this.panel) { continue; }
				await this.post({ command: 'productionTaskUsersLoaded', users: result.users });
			} catch (error) {
				if (revision !== this.refreshRevision || panel !== this.panel) { continue; }
				this.logger.error('Не удалось обновить список задач.', error);
				await this.post({ command: 'productionTasksFailed', message: error instanceof Error ? error.message : String(error) });
			}
			if (revision === this.refreshRevision) { return; }
		}
	}
	private async openTaskById(id: number): Promise<void> {
		if (!this.tasks.has(id) || this.openingTasks.has(id)) { return; }
		this.openingTasks.add(id);
		try {
			await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Загрузка карточки задачи…' }, async () => {
				const task = await loadProductionTaskById(await this.getOptions(), id, this.logger);
				if (task) { this.openTask(task); }
				else { void vscode.window.showInformationMessage(`Задача ${id} не найдена.`); }
			});
		} catch (error) {
			this.logger.error('Не удалось загрузить карточку задачи.', error);
			void vscode.window.showErrorMessage(`Не удалось открыть задачу ${id}: ${error instanceof Error ? error.message : String(error)}`);
		} finally { this.openingTasks.delete(id); }
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
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задачи</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
