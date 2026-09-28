import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { KnowledgeHistoryWebviewMessage } from '../../core/webviewProtocol';
import { WorkHistoryStore } from '../../mcp/workHistory/store';
import { findTaskSvnCommits } from '../../mcp/workHistory/svnCommits';
import { findKnowledgeRoot, listKnowledgeArticles, type KnowledgeArticle } from './gitKnowledgeCatalog';

export class KnowledgeHistoryPanel implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private embeddedWebview?: vscode.Webview;
	private search = '';
	private articles = new Map<string, KnowledgeArticle>();

	constructor(private readonly extensionUri: vscode.Uri, private readonly historyPath: string) {}

	attach(webview: vscode.Webview): void { this.embeddedWebview = webview; }
	detach(): void { this.embeddedWebview = undefined; }
	handleEmbeddedMessage(message: unknown): boolean {
		if (!isMessage(message)) { return false; }
		this.handleMessage(message);
		return true;
	}

	private handleMessage(message: KnowledgeHistoryWebviewMessage): void {
		if (message.command === 'knowledgeHistoryChooseRepository') { void this.chooseRepository(); return; }
		if (message.command === 'knowledgeHistoryOpenArticle') { void this.openArticle(message.id); return; }
		if (message.command === 'knowledgeHistoryOpenObject') {
			void vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', message.id);
			return;
		}
		if (message.command === 'knowledgeHistorySelectTask') {
			void this.selectTask(message.workspace, message.taskNumber);
			return;
		}
		if (message.command === 'knowledgeHistoryRefreshSvn') {
			void this.refreshSvn(message.workspace, message.taskNumber);
			return;
		}
		if (message.command === 'knowledgeHistoryOpenSvnCommit') {
			void this.openSvnCommit(message.workspace, message.taskNumber, message.commitId);
			return;
		}
		if (message.command === 'knowledgeHistorySearch') { this.search = message.search.slice(0, 300); }
		void this.refresh();
	}

	private webview(): vscode.Webview | undefined { return this.embeddedWebview ?? this.panel?.webview; }

	show(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Active, false);
			void this.refresh();
			return;
		}
		const panel = vscode.window.createWebviewPanel('vc-ve-tools.knowledgeHistory', 'Знания и история',
			vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
		this.panel = panel;
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		panel.webview.html = shell(panel.webview, assetsRoot);
		panel.webview.onDidReceiveMessage((message: unknown) => { this.handleEmbeddedMessage(message); });
		panel.onDidDispose(() => { this.panel = undefined; });
	}

	dispose(): void { this.panel?.dispose(); }

	private async refresh(): Promise<void> {
		try {
			const configured = vscode.workspace.getConfiguration('vcVeTools').get<string>('knowledgeRepositoryPath', '');
			const root = await findKnowledgeRoot(configured, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
			const articles = root ? await listKnowledgeArticles(root, this.search) : [];
			this.articles = new Map(articles.map(article => [article.id, article]));
			const store = new WorkHistoryStore(this.historyPath);
			try {
				await this.webview()?.postMessage({ command: 'knowledgeHistoryLoaded',
					tasks: store.searchTasks(this.search, 200, false),
					candidates: store.searchKnowledgeCandidates(this.search, undefined, 200),
					articles: articles.map(article => ({ id: article.id, title: article.title, excerpt: article.excerpt })),
					repository: root ?? null });
			} finally { store.close(); }
		} catch (error) {
			await this.webview()?.postMessage({ command: 'knowledgeHistoryFailed', message: errorMessage(error) });
		}
	}

	private async chooseRepository(): Promise<void> {
		const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true,
			canSelectMany: false, openLabel: 'Выбрать репозиторий знаний' });
		if (!selected?.[0]) { return; }
		const root = await findKnowledgeRoot(selected[0].fsPath);
		if (!root) {
			void vscode.window.showErrorMessage('В выбранной папке не найден docs/knowledge.');
			return;
		}
		await vscode.workspace.getConfiguration('vcVeTools').update('knowledgeRepositoryPath', root, vscode.ConfigurationTarget.Global);
		await this.refresh();
	}

	private async openArticle(id: string): Promise<void> {
		const article = this.articles.get(id);
		if (!article) { return; }
		await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(article.path));
	}

	private async selectTask(workspace: string, taskNumber: string): Promise<void> {
		try {
			const store = new WorkHistoryStore(this.historyPath);
			try {
				const context = store.getTaskContext(workspace, taskNumber);
				await this.webview()?.postMessage({ command: 'knowledgeHistoryTask', context });
				const scan = store.getTaskSvnScan(workspace, taskNumber);
				if (!scan || Date.now() - Date.parse(String(scan.scanned_at).replace(' ', 'T') + 'Z') > 3600000) {
					void this.refreshSvn(workspace, taskNumber);
				}
			} finally { store.close(); }
		} catch (error) {
			await this.webview()?.postMessage({ command: 'knowledgeHistoryFailed', message: errorMessage(error) });
		}
	}

	private async refreshSvn(workspace: string, taskNumber: string): Promise<void> {
		await this.webview()?.postMessage({ command: 'knowledgeHistorySvnLoading', workspace, taskNumber });
		try {
			const result = await findTaskSvnCommits(workspace, taskNumber);
			const store = new WorkHistoryStore(this.historyPath);
			try {
				store.saveSvnCommits(workspace, taskNumber, result.roots, result.commits);
				await this.webview()?.postMessage({ command: 'knowledgeHistorySvnLoaded', workspace, taskNumber,
					commits: store.getTaskSvnCommits(workspace, taskNumber), scan: store.getTaskSvnScan(workspace, taskNumber) });
			} finally { store.close(); }
		} catch (error) {
			await this.webview()?.postMessage({ command: 'knowledgeHistorySvnFailed', workspace, taskNumber, message: errorMessage(error) });
		}
	}

	private async openSvnCommit(workspace: string, taskNumber: string, commitId: number): Promise<void> {
		try {
			const store = new WorkHistoryStore(this.historyPath);
			let commit: Record<string, unknown> | undefined;
			try { commit = store.getTaskSvnCommits(workspace, taskNumber).find(row => row.id === commitId); }
			finally { store.close(); }
			if (!commit) { throw new Error(`SVN-коммит ${commitId} не найден у задачи ${taskNumber}.`); }
			await vscode.commands.executeCommand('vc-ve-tools.openSvnCommitChanges', commit.repository_root, commit.revision);
		} catch (error) {
			await this.webview()?.postMessage({ command: 'knowledgeHistorySvnFailed', workspace, taskNumber, message: errorMessage(error) });
		}
	}
}

function isMessage(value: unknown): value is KnowledgeHistoryWebviewMessage {
	if (!value || typeof value !== 'object' || !('command' in value)) { return false; }
	const message = value as Record<string, unknown>;
	if (message.command === 'knowledgeHistoryReady' || message.command === 'knowledgeHistoryRefresh'
		|| message.command === 'knowledgeHistoryChooseRepository') { return true; }
	if (message.command === 'knowledgeHistorySearch') { return typeof message.search === 'string'; }
	if (message.command === 'knowledgeHistoryOpenArticle') { return typeof message.id === 'string'; }
	if (message.command === 'knowledgeHistoryOpenObject') {
		return typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0;
	}
	if (message.command === 'knowledgeHistoryOpenSvnCommit') {
		return typeof message.taskNumber === 'string' && typeof message.workspace === 'string'
			&& typeof message.commitId === 'number' && Number.isSafeInteger(message.commitId) && message.commitId > 0;
	}
	return (message.command === 'knowledgeHistorySelectTask' || message.command === 'knowledgeHistoryRefreshSvn')
		&& typeof message.taskNumber === 'string' && typeof message.workspace === 'string';
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const script = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'knowledge-history.js'));
	const style = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
	const nonce = randomBytes(16).toString('base64');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}'; worker-src blob:;"><link rel="stylesheet" href="${style}"><title>Знания и история</title></head><body><div id="app"></div><script type="module" nonce="${nonce}" src="${script}"></script></body></html>`;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
