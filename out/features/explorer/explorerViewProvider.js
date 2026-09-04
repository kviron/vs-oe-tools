"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExplorerViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
class ExplorerViewProvider {
    workspaceState;
    extensionUri;
    getClasses;
    openClass;
    openDfmEditor;
    openDfmPreview;
    searchObjects;
    openMethod;
    openAttribute;
    openClassObjects;
    view;
    selectedEntityId;
    output = vscode.window.createOutputChannel('Восточный Экспресс: Проводник');
    constructor(workspaceState, extensionUri, getClasses, openClass, openDfmEditor, openDfmPreview, searchObjects, openMethod, openAttribute, openClassObjects) {
        this.workspaceState = workspaceState;
        this.extensionUri = extensionUri;
        this.getClasses = getClasses;
        this.openClass = openClass;
        this.openDfmEditor = openDfmEditor;
        this.openDfmPreview = openDfmPreview;
        this.searchObjects = searchObjects;
        this.openMethod = openMethod;
        this.openAttribute = openAttribute;
        this.openClassObjects = openClassObjects;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        this.log('Webview проводника создан.');
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
        webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);
        webviewView.webview.onDidReceiveMessage((message) => {
            if (!(0, webviewProtocol_1.isExplorerWebviewMessage)(message)) {
                this.log(`Отклонено неизвестное сообщение: ${safeJson(message)}`);
                return;
            }
            if (message.command === 'explorerDebugLog') {
                this.log(`[webview] ${message.message}`);
                return;
            }
            if (message.command === 'explorerReady') {
                const state = this.workspaceState.get('explorer.state', { activeTab: 'packages' });
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
            void this.openClass(message.id, message.pinned).catch((error) => {
                const detail = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Не удалось открыть класс: ${detail}`);
            });
        });
    }
    dispose() {
        void vscode.commands.executeCommand('setContext', 'vcVeTools.explorerCopyContext', false);
        this.view = undefined;
        this.output.dispose();
    }
    refreshClasses() { void this.postMessage({ command: 'resetClasses' }); }
    async revealClass(id) {
        this.selectedEntityId = id;
        await vscode.commands.executeCommand('workbench.view.extension.vc-ve-tools');
        await this.postMessage({ command: 'revealClass', id });
    }
    async copySelectedEntityId() {
        this.log(`Вызвана команда VS Code copySelectedEntityId; ID=${this.selectedEntityId ?? 'нет'}.`);
        if (this.selectedEntityId === undefined) {
            return;
        }
        await vscode.env.clipboard.writeText(String(this.selectedEntityId));
        vscode.window.setStatusBarMessage(`ID ${this.selectedEntityId} скопирован`, 1500);
    }
    log(message) {
        this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
    async sendClasses() {
        try {
            await this.postMessage({ command: 'classesLoaded', classes: await this.getClasses() });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postMessage({ command: 'classesLoadFailed', message });
        }
    }
    async sendObjectSearch(query) {
        const normalized = query.trim();
        if (!normalized) {
            await this.postMessage({ command: 'databaseObjectsLoaded', query: normalized, objects: [] });
            return;
        }
        await this.postMessage({ command: 'databaseObjectsLoading', query: normalized });
        try {
            await this.postMessage({ command: 'databaseObjectsLoaded', query: normalized, objects: await this.searchObjects(normalized) });
        }
        catch (error) {
            await this.postMessage({ command: 'databaseObjectsLoadFailed', query: normalized, message: error instanceof Error ? error.message : String(error) });
        }
    }
    async openDatabaseObject(id, kind, pinned) {
        try {
            if (kind === 'class') {
                await this.openClass(id, pinned);
            }
            else if (kind === 'method') {
                await this.openMethod(id);
            }
            else if (kind === 'attribute') {
                await this.openAttribute(id);
            }
            else {
                void vscode.window.showInformationMessage(`Для объекта ID=${id} пока нет специализированного редактора.`);
            }
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось открыть объект ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async postMessage(message) {
        await this.view?.webview.postMessage(message);
    }
    getHtml(webview, assetsRoot) {
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
    createNonce() {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
    }
}
exports.ExplorerViewProvider = ExplorerViewProvider;
function safeJson(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=explorerViewProvider.js.map