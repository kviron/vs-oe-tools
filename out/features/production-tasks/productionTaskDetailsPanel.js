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
exports.openProductionTaskDetails = openProductionTaskDetails;
exports.closeProductionTaskDetailsPanels = closeProductionTaskDetailsPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const panels = new Map();
function openProductionTaskDetails(context, task, findObjectById, loadAttachments) {
    const existing = panels.get(task.id);
    if (existing) {
        existing.reveal(vscode.ViewColumn.Active);
        return;
    }
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.productionTaskDetails', `Задача ${task.number || task.id}`, vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
    });
    panels.set(task.id, panel);
    panel.webview.html = shell(panel.webview, assetsRoot);
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!(0, webviewProtocol_1.isProductionTaskDetailsWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'productionTaskDetailsReady') {
            await panel.webview.postMessage({ command: 'productionTaskDetailsLoaded', task });
            return;
        }
        if (message.command === 'copyTableCells') {
            await vscode.env.clipboard.writeText(message.text);
            return;
        }
        if (message.command === 'tableSelectionDebug') {
            return;
        }
        if (message.command === 'loadProductionTaskAttachments') {
            await panel.webview.postMessage({ command: 'productionTaskAttachmentsLoading' });
            try {
                const attachments = await loadAttachments();
                await panel.webview.postMessage({ command: 'productionTaskAttachmentsLoaded', attachments });
            }
            catch (error) {
                await panel.webview.postMessage({
                    command: 'productionTaskAttachmentsFailed',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        }
        if (message.command === 'openDatabaseObjectById') {
            await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', message.id);
            return;
        }
        if (message.command === 'loadDatabaseObjectPreview') {
            try {
                const object = await findObjectById(message.id);
                await panel.webview.postMessage({ command: 'databaseObjectPreviewLoaded', id: message.id, object });
            }
            catch (error) {
                await panel.webview.postMessage({
                    command: 'databaseObjectPreviewFailed', id: message.id,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        }
        const uri = vscode.Uri.parse(`https://dev.oe-it.ru/oe-ric224:/open/РаботаДокумент/${message.id}`);
        if (!await vscode.env.openExternal(uri)) {
            void vscode.window.showErrorMessage(`Не удалось открыть задачу ${message.id} в клиенте.`);
        }
    });
    panel.onDidDispose(() => panels.delete(task.id));
}
function closeProductionTaskDetailsPanels() {
    for (const panel of panels.values()) {
        panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-task-details.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-task-details.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задача</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=productionTaskDetailsPanel.js.map