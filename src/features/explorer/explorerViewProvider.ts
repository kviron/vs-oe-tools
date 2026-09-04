import * as vscode from 'vscode';
import type { ExplorerHostMessage } from '../../core/webviewProtocol';
import { isExplorerWebviewMessage } from '../../core/webviewProtocol';
import type { ClassTreeRow } from '../classes/models';
import type { DatabaseObjectKind, DatabaseObjectSearchResult } from '../../core/objectSearch';

export class ExplorerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view?: vscode.WebviewView;
	private selectedEntityId?: number;
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Проводник');
	constructor(
		private readonly workspaceState: vscode.Memento,
		private readonly extensionUri: vscode.Uri,
		private readonly getClasses: () => Promise<ClassTreeRow[]>,
		private readonly openClass: (id: number, pinned: boolean) => Promise<void>,
		private readonly openDfmEditor: (id: number) => Promise<void>,
		private readonly openDfmPreview: (id: number) => Promise<void>,
		private readonly searchObjects: (query: string) => Promise<DatabaseObjectSearchResult[]>,
		private readonly openMethod: (id: number) => Promise<void>,
		private readonly openAttribute: (id: number) => Promise<void>,
		private readonly openClassObjects: (id: number) => Promise<void>,
		private readonly viewObject: (id: number) => Promise<void>,
		private readonly viewEntityProperties: (id: number) => Promise<void>,
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
			if (message.command === 'explorerReady') {
				const state = this.workspaceState.get<{ activeTab: string; selectedClassId?: number }>('explorer.state', { activeTab: 'packages' });
				void this.postMessage({ command: 'restoreExplorerState', ...state });
				return;
			}
			if (message.command === 'explorerStateChanged') {
				this.selectedEntityId = message.selectedClassId;
				void this.workspaceState.update('explorer.state', { activeTab: message.activeTab, selectedClassId: message.selectedClassId });
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
			if (message.command === 'searchDatabaseObjects') {
				void this.sendObjectSearch(message.query);
				return;
			}
			if (message.command === 'openDatabaseObject') {
				void this.openDatabaseObject(message.id, message.kind, message.pinned);
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
			if (message.command === 'openDfmEditor' || message.command === 'openDfmPreview') {
				const action = message.command === 'openDfmEditor' ? this.openDfmEditor : this.openDfmPreview;
				void action(message.classId).catch(error => void vscode.window.showErrorMessage(`Не удалось открыть DFM: ${error instanceof Error ? error.message : String(error)}`));
				return;
			}
			if (message.command === 'openClassObjects') {
				void this.openClassObjects(message.classId).catch(error => void vscode.window.showErrorMessage(`Не удалось открыть объекты класса: ${error instanceof Error ? error.message : String(error)}`));
				return;
			}
			if (message.command === 'viewObject') {
				void this.viewObject(message.id).catch(error => void vscode.window.showErrorMessage(`Не удалось открыть объект: ${error instanceof Error ? error.message : String(error)}`));
				return;
			}
			if (message.command === 'viewEntityProperties') {
				void this.viewEntityProperties(message.id).catch(error => void vscode.window.showErrorMessage(`Не удалось открыть свойства: ${error instanceof Error ? error.message : String(error)}`));
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
	private async sendObjectSearch(query: string): Promise<void> {
		const normalized = query.trim();
		if (!normalized) {
			await this.postMessage({ command: 'databaseObjectsLoaded', query: normalized, objects: [] });
			return;
		}
		await this.postMessage({ command: 'databaseObjectsLoading', query: normalized });
		try {
			await this.postMessage({ command: 'databaseObjectsLoaded', query: normalized, objects: await this.searchObjects(normalized) });
		} catch (error) {
			await this.postMessage({ command: 'databaseObjectsLoadFailed', query: normalized, message: error instanceof Error ? error.message : String(error) });
		}
	}
	private async openDatabaseObject(id: number, kind: DatabaseObjectKind, pinned: boolean): Promise<void> {
		try {
			if (kind === 'class') {
				await this.openClass(id, pinned);
			} else if (kind === 'method') {
				await this.openMethod(id);
			} else if (kind === 'attribute') {
				await this.openAttribute(id);
			} else {
				void vscode.window.showInformationMessage(`Для объекта ID=${id} пока нет специализированного редактора.`);
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось открыть объект ${id}: ${error instanceof Error ? error.message : String(error)}`);
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
