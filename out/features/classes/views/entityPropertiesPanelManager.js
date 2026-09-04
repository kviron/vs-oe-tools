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
exports.openEntityProperties = openEntityProperties;
exports.closeEntityPropertiesPanels = closeEntityPropertiesPanels;
const vscode = __importStar(require("vscode"));
const objectViewRepository_1 = require("../../../infrastructure/database/objectViewRepository");
const panels = new Map();
async function openEntityProperties(context, objectId) {
    const existing = panels.get(objectId);
    if (existing) {
        existing.reveal(vscode.ViewColumn.Active);
        return;
    }
    const result = await (0, objectViewRepository_1.getObjectView)(objectId);
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.entityProperties', `Свойства — ${result.name || result.id}`, vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [assetsRoot],
    });
    panels.set(objectId, panel);
    panel.webview.html = shell(panel.webview, assetsRoot);
    panel.webview.onDidReceiveMessage((message) => {
        if (typeof message === 'object' && message !== null && 'command' in message && message.command === 'entityPropertiesReady') {
            const attributes = Object.fromEntries(result.fields.filter(field => field.kind === 'attribute').map(field => [field.tableField.toLocaleLowerCase(), field.value]));
            void panel.webview.postMessage({ command: 'entityPropertiesLoaded', result: { ...result, fields: result.fields.filter(field => field.kind === 'property') }, attributes });
        }
    });
    panel.onDidDispose(() => panels.delete(objectId));
}
function closeEntityPropertiesPanels() {
    for (const panel of panels.values()) {
        panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'entity-properties.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'entity-properties.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Свойства</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=entityPropertiesPanelManager.js.map