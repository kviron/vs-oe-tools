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
exports.openObjectView = openObjectView;
exports.closeObjectViewPanels = closeObjectViewPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const tableSelectionLogger_1 = require("../../../core/tableSelectionLogger");
const objectViewRepository_1 = require("../../../infrastructure/database/objectViewRepository");
const panels = new Map();
async function openObjectView(context, objectId) {
    const existing = panels.get(objectId);
    if (existing) {
        existing.panel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.objectView', `Просмотр объекта ${objectId}`, vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
    });
    const entry = { panel };
    panels.set(objectId, entry);
    panel.webview.html = shell(panel.webview, assetsRoot);
    const load = async () => {
        await panel.webview.postMessage({ command: 'objectViewLoading' });
        try {
            entry.result = await (0, objectViewRepository_1.getObjectView)(objectId);
            panel.title = `Просмотр объекта ${entry.result.name || entry.result.id}`;
            await panel.webview.postMessage({ command: 'objectViewLoaded', result: entry.result });
        }
        catch (error) {
            await panel.webview.postMessage({ command: 'objectViewLoadFailed', message: error instanceof Error ? error.message : String(error) });
        }
    };
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!(0, webviewProtocol_1.isObjectViewWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'objectViewReady' || message.command === 'refreshObjectView') {
            await load();
            return;
        }
        if (message.command === 'copyTableCells') {
            await vscode.env.clipboard.writeText(message.text);
            return;
        }
        if (message.command === 'tableSelectionDebug') {
            (0, tableSelectionLogger_1.logTableSelection)('Просмотр объекта', message.message);
            return;
        }
        if (entry.result) {
            await vscode.env.clipboard.writeText(JSON.stringify(entry.result, null, 2));
            vscode.window.setStatusBarMessage('Объект скопирован в буфер обмена как JSON', 1800);
        }
    });
    panel.onDidDispose(() => panels.delete(objectId));
}
function closeObjectViewPanels() {
    for (const entry of panels.values()) {
        entry.panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'object-view.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'object-view.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Просмотр объекта</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=objectViewPanelManager.js.map