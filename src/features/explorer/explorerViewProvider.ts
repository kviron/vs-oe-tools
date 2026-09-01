import * as vscode from 'vscode';
import type { ExplorerHostMessage } from '../../core/webviewProtocol';
import { isExplorerWebviewMessage } from '../../core/webviewProtocol';
import type { ClassTreeRow } from '../classes/models';

export class ExplorerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view?: vscode.WebviewView;
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly getClasses: () => Promise<ClassTreeRow[]>,
		private readonly openClass: (id: number, pinned: boolean) => Promise<void>,
	) {}
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			if (!isExplorerWebviewMessage(message)) {
				return;
			}
			if (message.command === 'loadClasses') {
				void this.sendClasses();
				return;
			}
			void this.openClass(message.id, message.pinned).catch((error) => {
				const detail = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Не удалось открыть класс: ${detail}`);
			});
		});
	}
	dispose(): void { this.view = undefined; }
	refreshClasses(): void { void this.postMessage({ command: 'resetClasses' }); }
	private async sendClasses(): Promise<void> {
		try {
			await this.postMessage({ command: 'classesLoaded', classes: await this.getClasses() });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.postMessage({ command: 'classesLoadFailed', message });
		}
	}
	private async postMessage(message: ExplorerHostMessage): Promise<void> {
		await this.view?.webview.postMessage(message);
	}
	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'explorer.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'explorer.css'));
		const nonce = this.createNonce();
		return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>Проводник</title></head>
<body><div id="app"><p id="webview-status">Загрузка проводника…</p></div>
<script nonce="${nonce}">
const status = document.getElementById('webview-status');
let startupFailed = false;
const showFailure = (message) => {
	startupFailed = true;
	if (status) status.textContent = 'Не удалось запустить проводник: ' + message;
};
window.addEventListener('error', (event) => showFailure(event.message || 'ошибка JavaScript'));
window.addEventListener('unhandledrejection', (event) => showFailure(String(event.reason || 'ошибка Promise')));
const applicationScript = document.createElement('script');
applicationScript.src = '${scriptUri}';
applicationScript.nonce = '${nonce}';
applicationScript.onerror = () => showFailure('не загружен файл explorer.js');
applicationScript.onload = () => window.setTimeout(() => {
	if (!startupFailed && document.documentElement.dataset.webviewBoot !== 'ready') showFailure('Vue не завершил инициализацию');
}, 1000);
document.body.append(applicationScript);
</script></body></html>`;
	}
	private createNonce(): string {
		const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
	}
}
