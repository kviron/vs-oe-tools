import * as vscode from 'vscode';
import type { ExplorerHostMessage } from '../../core/webviewProtocol';
import { isExplorerWebviewMessage } from '../../core/webviewProtocol';
import type { ClassTreeRow } from '../classes/models';

export class ExplorerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view?: vscode.WebviewView;
	private selectedEntityId?: number;
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Проводник');
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly getClasses: () => Promise<ClassTreeRow[]>,
		private readonly openClass: (id: number, pinned: boolean) => Promise<void>,
	) {}
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		this.log('Webview проводника создан.');
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			if (!isExplorerWebviewMessage(message)) {
				this.log(`Отклонено неизвестное сообщение: ${safeJson(message)}`);
				return;
			}
			if (message.command === 'explorerDebugLog') {
				this.log(`[webview] ${message.message}`);
				return;
			}
			if (message.command === 'setExplorerCopyContext') {
				void vscode.commands.executeCommand('setContext', 'vcVeTools.explorerCopyContext', message.active);
				this.log(`Контекст Ctrl+C: active=${message.active}.`);
				return;
			}
			if (message.command === 'loadClasses') {
				void this.sendClasses();
				return;
			}
			if (message.command === 'copyEntityId') {
				this.log(`Получена команда копирования ID=${message.id}.`);
				void vscode.env.clipboard.writeText(String(message.id));
				vscode.window.setStatusBarMessage(`ID ${message.id} скопирован`, 1500);
				return;
			}
			if (message.command === 'selectExplorerEntity') {
				this.selectedEntityId = message.id;
				this.log(`Выделение изменено: ID=${message.id ?? 'нет'}.`);
				return;
			}
			void this.openClass(message.id, message.pinned).catch((error) => {
				const detail = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Не удалось открыть класс: ${detail}`);
			});
		});
	}
	dispose(): void {
		void vscode.commands.executeCommand('setContext', 'vcVeTools.explorerCopyContext', false);
		this.view = undefined;
		this.output.dispose();
	}
	refreshClasses(): void { void this.postMessage({ command: 'resetClasses' }); }
	async revealClass(id: number): Promise<void> {
		this.selectedEntityId = id;
		await vscode.commands.executeCommand('workbench.view.extension.vc-ve-tools');
		await this.postMessage({ command: 'revealClass', id });
	}
	async copySelectedEntityId(): Promise<void> {
		this.log(`Вызвана команда VS Code copySelectedEntityId; ID=${this.selectedEntityId ?? 'нет'}.`);
		if (this.selectedEntityId === undefined) {
			return;
		}
		await vscode.env.clipboard.writeText(String(this.selectedEntityId));
		vscode.window.setStatusBarMessage(`ID ${this.selectedEntityId} скопирован`, 1500);
	}
	private log(message: string): void {
		this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
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

function safeJson(value: unknown): string {
	try { return JSON.stringify(value); } catch { return String(value); }
}
