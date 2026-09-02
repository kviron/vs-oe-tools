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
exports.openClassDetails = openClassDetails;
exports.closeClassDetailPanels = closeClassDetailPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const classRepository_1 = require("../../../infrastructure/database/classRepository");
const classDetailPanels = new Map();
let previewClassPanelId;
function postDetails(entry) {
    const message = { command: 'classDetailsLoaded', details: entry.details };
    void entry.panel.webview.postMessage(message);
}
function updateClassDetailPanel(entry, classDetails) {
    entry.details = classDetails;
    entry.panel.title = `Класс ${classDetails.name}`;
    postDetails(entry);
    entry.panel.reveal(vscode.ViewColumn.Active);
}
function createPanel(context, classDetails, pinned) {
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.classDetails', `Класс ${classDetails.name}`, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [assetsRoot] });
    const entry = { panel, pinned, details: classDetails };
    panel.webview.onDidReceiveMessage(async (message) => {
        if ((0, webviewProtocol_1.isClassDetailsWebviewMessage)(message)) {
            if (message.command === 'classDetailsReady') {
                postDetails(entry);
                return;
            }
            const requestedClassId = entry.details.id;
            try {
                const attributes = await (0, classRepository_1.getClassAttributes)(requestedClassId, entry.details.name);
                if (entry.details.id === requestedClassId) {
                    void panel.webview.postMessage({ command: 'classAttributesLoaded', attributes });
                }
            }
            catch (error) {
                const failureMessage = error instanceof Error ? error.message : String(error);
                void panel.webview.postMessage({ command: 'classAttributesLoadFailed', message: failureMessage });
            }
        }
    });
    panel.webview.html = getClassDetailsShell(panel.webview, assetsRoot);
    return entry;
}
async function openClassDetails(context, id, pinned) {
    const existingPanel = classDetailPanels.get(id);
    if (existingPanel) {
        if (pinned && !existingPanel.pinned) {
            existingPanel.pinned = true;
            previewClassPanelId = undefined;
        }
        existingPanel.panel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const classDetails = await (0, classRepository_1.getClassDetails)(id);
    const previousPreviewPanelId = previewClassPanelId;
    const previewPanel = previousPreviewPanelId === undefined ? undefined : classDetailPanels.get(previousPreviewPanelId);
    if (previewPanel && previousPreviewPanelId !== undefined && !previewPanel.pinned) {
        classDetailPanels.delete(previousPreviewPanelId);
        classDetailPanels.set(id, previewPanel);
        previewPanel.pinned = pinned;
        previewClassPanelId = pinned ? undefined : id;
        updateClassDetailPanel(previewPanel, classDetails);
        return;
    }
    const entry = createPanel(context, classDetails, pinned);
    classDetailPanels.set(id, entry);
    if (!pinned) {
        previewClassPanelId = id;
    }
    entry.panel.onDidDispose(() => {
        for (const [panelId, candidate] of classDetailPanels) {
            if (candidate.panel === entry.panel) {
                classDetailPanels.delete(panelId);
                if (previewClassPanelId === panelId) {
                    previewClassPanelId = undefined;
                }
            }
        }
    });
}
function closeClassDetailPanels() {
    for (const { panel } of [...classDetailPanels.values()]) {
        panel.dispose();
    }
    classDetailPanels.clear();
    previewClassPanelId = undefined;
}
function getClassDetailsShell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-details.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-details.css'));
    const nonce = createNonce();
    return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>Класс</title></head>
<body><div id="app">Загрузка класса…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
function createNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
//# sourceMappingURL=classDetailsPanelManager.js.map