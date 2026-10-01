import * as vscode from 'vscode';
import { logTableSelection } from '../../core/tableSelectionLogger';
import type { NativeLogsHostMessage } from '../../core/webviewProtocol';
import { isNativeLogsWebviewMessage } from '../../core/webviewProtocol';
import type { SearchOptions } from '../../core/searchMatch';
import { listNativeLogs } from './nativeLogService';

export class NativeLogsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'vc-ve-tools.nativeLogs';
	private selectedFile?: string;
	private refreshId = 0;

	public constructor(private readonly extensionUri: vscode.Uri, private readonly openLog: (fileName: string) => Promise<void>) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);
		webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
			if (!isNativeLogsWebviewMessage(message)) { return; }
			if (message.command === 'tableSelectionDebug') {
				logTableSelection('native-logs', message.message);
				return;
			}
			if (message.command === 'copyTableCells') {
				await vscode.env.clipboard.writeText(message.text);
				logTableSelection('native-logs', `Скопировано символов: ${message.text.length}`);
				return;
			}
			if (message.command === 'copyNativeLog') {
				await vscode.env.clipboard.writeText(message.text);
				vscode.window.setStatusBarMessage('Лог нативного клиента скопирован', 2500);
				return;
			}
			if (message.command === 'openNativeLog') {
				this.selectedFile = message.fileName;
				await this.openLog(message.fileName);
				return;
			}
			await this.refresh(webviewView.webview, message.command === 'refreshNativeLogs' ? message.query : undefined, message.command === 'refreshNativeLogs' ? message.options : undefined);
		});
	}

	private async refresh(webview: vscode.Webview, query = '', options?: SearchOptions): Promise<void> {
		const refreshId = ++this.refreshId;
		void webview.postMessage({ command: 'nativeLogsLoading' } satisfies NativeLogsHostMessage);
		try {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) { throw new Error('Откройте папку проекта Восточного Экспресса.'); }
			const listing = await listNativeLogs(workspacePath, 500, query, options, () => refreshId !== this.refreshId);
			if (refreshId !== this.refreshId) { return; }
			if (!this.selectedFile || !listing.files.some(file => file.name === this.selectedFile)) {
				this.selectedFile = listing.files[0]?.name;
			}
			void webview.postMessage({
				command: 'nativeLogsLoaded',
				directory: listing.directory,
				files: listing.files.map(({ name, size, modifiedAt }) => ({ name, size, modifiedAt })),
				selectedFile: this.selectedFile,
			} satisfies NativeLogsHostMessage);
		} catch (error) {
			if (refreshId !== this.refreshId) { return; }
			void webview.postMessage({ command: 'nativeLogsFailed', message: error instanceof Error ? error.message : String(error) } satisfies NativeLogsHostMessage);
		}
	}

	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'native-logs.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
		const nonce = createNonce();
		return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Логирование</title></head><body><div id="app">Загрузка логов…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
	}
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
