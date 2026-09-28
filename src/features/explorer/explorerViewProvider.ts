import * as vscode from 'vscode';
import type { ExplorerHostMessage } from '../../core/webviewProtocol';
import { isExplorerWebviewMessage } from '../../core/webviewProtocol';
import type { ClassTreeRow } from '../classes/models';
import type { DatabaseObjectSearchResult } from '../../core/objectSearch';
import type { PackageExplorerNode, PackageFileContent, PackageSummary } from '../packages/models';
import { createExplorerMessageHandler } from './messageHandler';
import type { ExplorerMessageActions } from './messageHandler';
import { createExplorerDataResponses } from './dataResponses';
import { createObjectNavigator } from './objectNavigation';

export interface ExplorerDependencies {
	workspaceState: vscode.Memento;
	extensionUri: vscode.Uri;
	getClasses(): Promise<ClassTreeRow[]>;
	openClass(id: number, pinned: boolean): Promise<void>;
	openDfmEditor(id: number): Promise<void>;
	openDfmPreview(id: number): Promise<void>;
	searchObjects(query: string): Promise<DatabaseObjectSearchResult[]>;
	openMethod(id: number): Promise<void>;
	openModule(id: number): Promise<void>;
	openAttribute(id: number): Promise<void>;
	openClassObjects(id: number): Promise<void>;
	viewObject(id: number): Promise<void>;
	viewEntityProperties(id: number): Promise<void>;
	getPackages(): Promise<PackageSummary[]>;
	getPackageTree(packageId: number): Promise<PackageExplorerNode>;
	getPackageFileContent(fileId: number): Promise<PackageFileContent>;
	openPackageContent(fileId: number, objectId?: number): Promise<void>;
}

export class ExplorerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view?: vscode.WebviewView;
	private selectedEntityId?: number;
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Проводник');
	private readonly messageActions: ExplorerMessageActions = {
		log: message => this.log(message),
		postMessage: message => this.postMessage(message),
		setSelectedEntityId: id => { this.selectedEntityId = id; },
		sendClasses: () => this.dataResponses.sendClasses(),
		sendPackages: () => this.dataResponses.sendPackages(),
		sendPackageTree: id => this.dataResponses.sendPackageTree(id),
		sendPackageFileObjects: id => this.dataResponses.sendPackageFileObjects(id),
		sendObjectSearch: query => this.dataResponses.sendObjectSearch(query),
		openDatabaseObject: (id, kind, pinned) => this.openDatabaseObject(id, kind, pinned),
	};
	private readonly dataResponses;
	private readonly openDatabaseObject;
	constructor(private readonly dependencies: ExplorerDependencies) {
		this.dataResponses = createExplorerDataResponses(dependencies, message => this.postMessage(message));
		this.openDatabaseObject = createObjectNavigator(dependencies);
	}
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		this.log('Webview проводника создан.');
		const assetsRoot = vscode.Uri.joinPath(this.dependencies.extensionUri, 'dist', 'webview');
		webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);
		const handleMessage = createExplorerMessageHandler(this.dependencies, this.messageActions);
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			if (!isExplorerWebviewMessage(message)) {
				this.log(`Отклонено неизвестное сообщение: ${safeJson(message)}`);
				return;
			}
			handleMessage(message);
		});
	}
	dispose(): void {
		void vscode.commands.executeCommand('setContext', 'vcVeTools.explorerCopyContext', false);
		this.view = undefined;
		this.output.dispose();
	}
	refreshClasses(): void { void this.postMessage({ command: 'resetClasses' }); void this.postMessage({ command: 'resetPackages' }); }
	async revealClass(id: number): Promise<void> {
		this.selectedEntityId = id;
		await vscode.commands.executeCommand('workbench.view.extension.vc-ve-tools');
		await this.postMessage({ command: 'revealClass', id });
	}
	async revealPackage(id: number): Promise<void> {
		await vscode.commands.executeCommand('workbench.view.extension.vc-ve-tools');
		await this.postMessage({ command: 'revealPackage', id });
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
	private async postMessage(message: ExplorerHostMessage): Promise<void> {
		await this.view?.webview.postMessage(message);
	}
	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'explorer.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
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
applicationScript.type = 'module';
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
