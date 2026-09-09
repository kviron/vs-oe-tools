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
exports.openPropertyDetails = openPropertyDetails;
exports.closePropertyDetailPanels = closePropertyDetailPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const classRepository_1 = require("../../../infrastructure/database/classRepository");
const panels = new Map();
async function openPropertyDetails(context, propertyId) {
    const existing = panels.get(propertyId);
    if (existing) {
        existing.panel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const details = await (0, classRepository_1.getClassPropertyDetails)(propertyId);
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.propertyDetails', `Свойство ${details.name}`, vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
    });
    const entry = { panel, details };
    panels.set(propertyId, entry);
    panel.webview.html = shell(panel.webview, assetsRoot);
    panel.webview.onDidReceiveMessage((message) => {
        if ((0, webviewProtocol_1.isPropertyDetailsWebviewMessage)(message)) {
            void panel.webview.postMessage({ command: 'propertyDetailsLoaded', details: entry.details });
        }
    });
    panel.onDidDispose(() => panels.delete(propertyId));
}
function closePropertyDetailPanels() {
    for (const entry of panels.values()) {
        entry.panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'property-details.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'property-details.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Свойство</title></head><body><div id="app">Загрузка свойства…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=propertyDetailsPanelManager.js.map