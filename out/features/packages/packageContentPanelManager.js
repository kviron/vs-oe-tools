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
exports.openPackageContent = openPackageContent;
exports.closePackageContentPanels = closePackageContentPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const tableSelectionLogger_1 = require("../../core/tableSelectionLogger");
const packageExplorerRepository_1 = require("../../infrastructure/database/packageExplorerRepository");
const panels = new Map();
async function openPackageContent(context, fileId, objectId, openObject) {
    const existing = panels.get(fileId);
    if (existing) {
        existing.selectedObjectId = objectId;
        existing.panel.reveal(vscode.ViewColumn.Active);
        if (objectId !== undefined) {
            await existing.panel.webview.postMessage({ command: 'revealPackageContentObject', objectId });
        }
        return;
    }
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.packageContent', `Содержимое файла ${fileId}`, vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
    });
    const entry = { panel, selectedObjectId: objectId };
    panels.set(fileId, entry);
    panel.webview.html = shell(panel.webview, assetsRoot);
    const load = async () => {
        await panel.webview.postMessage({ command: 'packageContentLoading' });
        try {
            entry.result = await (0, packageExplorerRepository_1.loadPackageFileContent)(fileId);
            panel.title = entry.result.fileName;
            await panel.webview.postMessage({ command: 'packageContentLoaded', result: entry.result, selectedObjectId: entry.selectedObjectId });
        }
        catch (error) {
            await panel.webview.postMessage({ command: 'packageContentLoadFailed', message: error instanceof Error ? error.message : String(error) });
        }
    };
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!(0, webviewProtocol_1.isPackageContentWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'packageContentReady' || message.command === 'refreshPackageContent') {
            await load();
            return;
        }
        if (message.command === 'copyTableCells') {
            await vscode.env.clipboard.writeText(message.text);
            return;
        }
        if (message.command === 'tableSelectionDebug') {
            (0, tableSelectionLogger_1.logTableSelection)('Содержимое пакета', message.message);
            return;
        }
        await openObject(message.id, message.kind);
    });
    panel.onDidDispose(() => panels.delete(fileId));
}
function closePackageContentPanels() {
    for (const entry of panels.values()) {
        entry.panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'package-content.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Содержимое файла пакета</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=packageContentPanelManager.js.map