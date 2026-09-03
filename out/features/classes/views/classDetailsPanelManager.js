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
exports.restoreClassDetailPanels = restoreClassDetailPanels;
exports.closeClassDetailPanels = closeClassDetailPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const classRepository_1 = require("../../../infrastructure/database/classRepository");
const tableSelectionLogger_1 = require("../../../core/tableSelectionLogger");
const classDetailPanels = new Map();
let previewClassPanelId;
function postDetails(entry) {
    const message = { command: 'classDetailsLoaded', details: entry.details, activeTab: entry.activeTab };
    void entry.panel.webview.postMessage(message);
}
function updateClassDetailPanel(entry, classDetails) {
    entry.details = classDetails;
    entry.panel.title = `Класс ${classDetails.name}`;
    postDetails(entry);
    entry.panel.reveal(vscode.ViewColumn.Active, !entry.pinned);
}
function persistPanels(context) {
    void context.workspaceState.update('classDetails.openPanels', [...classDetailPanels.values()].map(entry => ({ id: entry.details.id, pinned: entry.pinned, activeTab: entry.activeTab })));
}
function createPanel(context, classDetails, pinned, methodEditor, activeTab = 'class') {
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.classDetails', `Класс ${classDetails.name}`, { viewColumn: vscode.ViewColumn.Active, preserveFocus: !pinned }, { enableScripts: true, localResourceRoots: [assetsRoot] });
    const entry = { panel, pinned, details: classDetails, activeTab };
    panel.webview.onDidReceiveMessage(async (message) => {
        if ((0, webviewProtocol_1.isClassDetailsWebviewMessage)(message)) {
            if (message.command === 'classDetailsStateChanged') {
                entry.activeTab = message.activeTab;
                persistPanels(context);
                return;
            }
            if (message.command === 'tableSelectionDebug') {
                (0, tableSelectionLogger_1.logTableSelection)('Класс', message.message);
                return;
            }
            if (message.command === 'copyEntityId') {
                const ids = String(message.id);
                (0, tableSelectionLogger_1.logTableSelection)('Класс', `Контекстное меню copyEntityId: ${JSON.stringify(ids)}.`);
                try {
                    await vscode.env.clipboard.writeText(ids);
                    (0, tableSelectionLogger_1.logTableSelection)('Класс', 'ID записаны в буфер успешно.');
                    vscode.window.setStatusBarMessage(`ID ${ids} скопирован`, 1500);
                }
                catch (error) {
                    (0, tableSelectionLogger_1.logTableSelection)('Класс', `Ошибка копирования ID: ${error instanceof Error ? error.message : String(error)}.`);
                    void vscode.window.showErrorMessage(`Не удалось скопировать ID: ${error instanceof Error ? error.message : String(error)}`);
                }
                return;
            }
            if (message.command === 'copyTableCells') {
                (0, tableSelectionLogger_1.logTableSelection)('Класс', `extension host получил copyTableCells: символов=${message.text.length}, текст=${JSON.stringify(message.text.slice(0, 300))}.`);
                try {
                    await vscode.env.clipboard.writeText(message.text);
                    (0, tableSelectionLogger_1.logTableSelection)('Класс', 'vscode.env.clipboard.writeText завершён успешно.');
                    vscode.window.setStatusBarMessage('Выделенные ячейки скопированы', 1500);
                }
                catch (error) {
                    (0, tableSelectionLogger_1.logTableSelection)('Класс', `Ошибка записи в буфер: ${error instanceof Error ? error.message : String(error)}.`);
                    void vscode.window.showErrorMessage(`Не удалось скопировать ячейки: ${error instanceof Error ? error.message : String(error)}`);
                }
                return;
            }
            if (message.command === 'classDetailsReady') {
                postDetails(entry);
                return;
            }
            if (message.command === 'openMethod') {
                await methodEditor.open(message.id);
                return;
            }
            if (message.command === 'methodSvnAction') {
                const command = message.action === 'localDiff' ? 'vc-ve-tools.svnLocalDiff' : message.action === 'history' ? 'vc-ve-tools.svnHistory' : 'vc-ve-tools.svnBlame';
                await vscode.commands.executeCommand(command, message.id);
                return;
            }
            const requestedClassId = entry.details.id;
            if (message.command === 'loadClassMethods') {
                const includeInherited = message.includeInherited;
                try {
                    const methods = await (0, classRepository_1.getClassMethods)(requestedClassId, entry.details.name, includeInherited);
                    if (entry.details.id === requestedClassId) {
                        void panel.webview.postMessage({ command: 'classMethodsLoaded', methods, includeInherited });
                    }
                }
                catch (error) {
                    if (entry.details.id === requestedClassId) {
                        const failureMessage = error instanceof Error ? error.message : String(error);
                        void panel.webview.postMessage({ command: 'classMethodsLoadFailed', message: failureMessage, includeInherited });
                    }
                }
                return;
            }
            const includeInherited = message.includeInherited;
            try {
                const attributes = await (0, classRepository_1.getClassAttributes)(requestedClassId, entry.details.name, includeInherited);
                if (entry.details.id === requestedClassId) {
                    void panel.webview.postMessage({ command: 'classAttributesLoaded', attributes, includeInherited });
                }
            }
            catch (error) {
                const failureMessage = error instanceof Error ? error.message : String(error);
                void panel.webview.postMessage({ command: 'classAttributesLoadFailed', message: failureMessage, includeInherited });
            }
        }
    });
    panel.webview.html = getClassDetailsShell(panel.webview, assetsRoot);
    return entry;
}
async function openClassDetails(context, methodEditor, id, pinned, activeTab = 'class') {
    const existingPanel = classDetailPanels.get(id);
    if (existingPanel) {
        if (pinned && !existingPanel.pinned) {
            existingPanel.pinned = true;
            previewClassPanelId = undefined;
        }
        persistPanels(context);
        existingPanel.panel.reveal(vscode.ViewColumn.Active, !pinned);
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
        persistPanels(context);
        return;
    }
    const entry = createPanel(context, classDetails, pinned, methodEditor, activeTab);
    classDetailPanels.set(id, entry);
    persistPanels(context);
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
                persistPanels(context);
            }
        }
    });
}
async function restoreClassDetailPanels(context, methodEditor) {
    const panels = context.workspaceState.get('classDetails.openPanels', []);
    for (const panel of panels) {
        if (Number.isSafeInteger(panel.id)) {
            await openClassDetails(context, methodEditor, panel.id, panel.pinned, panel.activeTab);
        }
    }
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