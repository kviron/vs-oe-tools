import * as vscode from 'vscode';
import type { SvnConflictHostMessage } from '../../core/webviewProtocol';
import { isSvnConflictWebviewMessage } from '../../core/webviewProtocol';
import { loadConflictContent, saveConflictResult } from './svnMergeService';

export class SvnConflictPanel implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private filePath?: string;
	private conflict?: Awaited<ReturnType<typeof loadConflictContent>>;

	constructor(private readonly extensionUri: vscode.Uri, private readonly onResolved: (filePath: string) => void) {}

	async show(workingCopy: string, relativePath: string): Promise<void> {
		const conflict = await loadConflictContent(workingCopy, relativePath);
		this.filePath = conflict.filePath;
		this.conflict = conflict;
		if (!this.panel) {
			this.panel = vscode.window.createWebviewPanel('vc-ve-tools.svnConflict', `Конфликт: ${relativePath}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
			const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
			this.panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
			this.panel.webview.html = this.html(this.panel.webview, assetsRoot);
			this.panel.webview.onDidReceiveMessage(message => { void this.receive(message); });
			this.panel.onDidDispose(() => { this.panel = undefined; this.filePath = undefined; this.conflict = undefined; });
		} else {
			this.panel.title = `Конфликт: ${relativePath}`;
			this.panel.reveal(undefined, false);
		}
		await this.post({ command: 'svnConflictLoaded', conflict });
	}

	dispose(): void { this.panel?.dispose(); }

	private async receive(message: unknown): Promise<void> {
		if (!isSvnConflictWebviewMessage(message)) { return; }
		if (message.command === 'svnConflictReady') { if (this.conflict) { await this.post({ command: 'svnConflictLoaded', conflict: this.conflict }); } return; }
		if (!this.filePath) { return; }
		await this.post({ command: 'svnConflictSaving' });
		try {
			await saveConflictResult(this.filePath, message.content, message.resolve);
			await this.post({ command: 'svnConflictSaved', resolved: message.resolve });
			if (message.resolve) { this.onResolved(this.filePath); }
		} catch (error) {
			await this.post({ command: 'svnConflictFailed', message: error instanceof Error ? error.message : String(error) });
		}
	}

	private async post(message: SvnConflictHostMessage): Promise<void> { await this.panel?.webview.postMessage(message); }

	private html(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const script = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'svn-conflict.js'));
		const style = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'svn-conflict.css'));
		const nonce = Math.random().toString(36).slice(2);
		return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csp-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"><title>Разрешение SVN-конфликта</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
	}
}
