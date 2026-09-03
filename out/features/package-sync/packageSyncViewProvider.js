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
exports.PackageSyncPanelManager = void 0;
const vscode = __importStar(require("vscode"));
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const webviewProtocol_1 = require("../../core/webviewProtocol");
class PackageSyncPanelManager {
    extensionUri;
    loadItems;
    static viewType = 'vc-ve-tools.packageSync';
    panel;
    items = [];
    constructor(extensionUri, loadItems) {
        this.extensionUri = extensionUri;
        this.loadItems = loadItems;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(undefined, false);
            return;
        }
        const panel = vscode.window.createWebviewPanel(PackageSyncPanelManager.viewType, 'Синхронизация проектов', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        this.panel = panel;
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
        panel.webview.html = this.html(panel.webview, assetsRoot);
        panel.webview.onDidReceiveMessage((message) => {
            if (!(0, webviewProtocol_1.isPackageSyncWebviewMessage)(message)) {
                return;
            }
            if (message.command === 'packageSyncReady' || message.command === 'refreshPackageSync') {
                void this.refresh();
                return;
            }
            const item = this.items.find(candidate => candidate.objectId === message.objectId);
            if (!item?.localPath) {
                void vscode.window.showWarningMessage(`Для объекта ${message.objectId} не удалось определить локальный путь.`);
                return;
            }
            void this.openDiff(item);
        });
        panel.onDidDispose(() => { this.panel = undefined; });
    }
    refreshForDatabaseChange() { if (this.panel) {
        void this.refresh();
    } }
    dispose() { this.panel?.dispose(); }
    async openDiff(item) {
        try {
            const fileName = await resolveExistingFile(item.localPath);
            item.localPath = fileName;
            await this.post({ command: 'packageSyncLoaded', items: this.items });
            const generatedFileName = await findOriginalClientGeneratedFile(fileName);
            await vscode.commands.executeCommand('vc-ve-tools.openGeneratedPackageDiff', fileName, generatedFileName);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось открыть SVN diff: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async refresh() {
        await this.post({ command: 'packageSyncLoading' });
        try {
            this.items = await this.loadItems();
            await this.post({ command: 'packageSyncLoaded', items: this.items });
        }
        catch (error) {
            await this.post({ command: 'packageSyncFailed', message: error instanceof Error ? error.message : String(error) });
        }
    }
    async post(message) { await this.panel?.webview.postMessage(message); }
    html(webview, assetsRoot) {
        const script = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'package-sync.js'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'package-sync.css'));
        const nonce = Math.random().toString(36).slice(2);
        return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"><title>Синхронизация пакетов</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    }
}
exports.PackageSyncPanelManager = PackageSyncPanelManager;
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function findOriginalClientGeneratedFile(localFileName) {
    const script = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter "Name='TortoiseMerge.exe'" | Select-Object -ExpandProperty CommandLine | ConvertTo-Json -Compress`;
    let stdout;
    try {
        ({ stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' }));
    }
    catch {
        throw new Error('Не удалось получить параметры TortoiseMerge.');
    }
    if (!stdout.trim()) {
        throw new Error('Сначала откройте сравнение этого файла в оригинальном клиенте.');
    }
    let commandLines;
    try {
        const parsed = JSON.parse(stdout);
        commandLines = Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : typeof parsed === 'string' ? [parsed] : [];
    }
    catch {
        commandLines = [stdout];
    }
    const normalizedLocal = path.normalize(localFileName).toLocaleLowerCase('ru');
    for (const commandLine of commandLines) {
        const base = commandLine.match(/\/base:"([^"]+)"/i)?.[1];
        const mine = commandLine.match(/\/mine:"([^"]+)"/i)?.[1];
        if (!base || !mine || path.normalize(base).toLocaleLowerCase('ru') !== normalizedLocal) {
            continue;
        }
        try {
            await (0, promises_1.access)(mine);
            return mine;
        }
        catch {
            throw new Error(`Временная версия оригинального клиента уже удалена: ${mine}`);
        }
    }
    throw new Error('Откройте сравнение выбранного файла в оригинальном клиенте и повторите попытку.');
}
async function resolveExistingFile(fileName) {
    try {
        await (0, promises_1.access)(fileName);
        return fileName;
    }
    catch {
        // SysPackageBase may expose a logical path without the physical file extension.
    }
    if (path.extname(fileName)) {
        throw new Error(`Локальный файл не найден: ${fileName}`);
    }
    const directory = path.dirname(fileName);
    const stem = path.basename(fileName).toLocaleLowerCase('ru');
    let entries;
    try {
        entries = await (0, promises_1.readdir)(directory);
    }
    catch {
        throw new Error(`Локальный каталог не найден: ${directory}`);
    }
    const matches = entries.filter(entry => path.parse(entry).name.toLocaleLowerCase('ru') === stem);
    const priority = ['.pkf', '.pas', '.bat'];
    matches.sort((left, right) => {
        const leftIndex = priority.indexOf(path.extname(left).toLocaleLowerCase('en-US'));
        const rightIndex = priority.indexOf(path.extname(right).toLocaleLowerCase('en-US'));
        return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex);
    });
    const match = matches[0];
    if (!match) {
        throw new Error(`Локальный файл не найден: ${fileName} (файл с таким именем и расширением отсутствует)`);
    }
    return path.join(directory, match);
}
//# sourceMappingURL=packageSyncViewProvider.js.map