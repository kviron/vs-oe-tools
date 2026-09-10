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
exports.openSpuEditor = openSpuEditor;
exports.closeSpuEditorPanels = closeSpuEditorPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const spuRepository_1 = require("../../infrastructure/database/spuRepository");
const sqlCompletionSchema_1 = require("../../infrastructure/database/sqlCompletionSchema");
const panels = new Set();
async function openSpuEditor(context, options = {}, onSaved = () => undefined) {
    const editing = options.spuId !== undefined;
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.spuEditor', editing ? `SPU ${options.spuId}` : 'Новый SPU', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [assetsRoot] });
    panels.add(panel);
    panel.webview.html = shell(panel.webview, assetsRoot);
    const output = vscode.window.createOutputChannel('Восточный Экспресс: SPU');
    let saving = false;
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!(0, webviewProtocol_1.isSpuEditorWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'spuEditorReady') {
            try {
                const editorOptions = await (0, spuRepository_1.getSpuEditorOptions)(options.preferredPackageName, options.spuId);
                await panel.webview.postMessage({ command: 'spuEditorInitialized', options: editorOptions });
                void (0, sqlCompletionSchema_1.getSqlCompletionSchema)()
                    .then(completion => panel.webview.postMessage({ command: 'sqlCompletionSchemaLoaded', completion }))
                    .catch(error => output.appendLine(`[${new Date().toISOString()}] SQL-подсказки недоступны: ${errorMessage(error)}`));
            }
            catch (error) {
                await panel.webview.postMessage({ command: 'spuSaveFailed', message: errorMessage(error) });
            }
            return;
        }
        if (saving) {
            return;
        }
        if (message.draft.sqlScript.trim() && !message.draft.sqlScript.trimEnd().endsWith(';')) {
            const decision = await vscode.window.showWarningMessage(`В конце SQL-скрипта отсутствует «;». Всё равно ${editing ? 'сохранить' : 'создать'} SPU?`, { modal: true }, editing ? 'Сохранить' : 'Создать');
            if (decision !== (editing ? 'Сохранить' : 'Создать')) {
                return;
            }
        }
        saving = true;
        await panel.webview.postMessage({ command: 'spuSaving' });
        try {
            const logger = (value) => output.appendLine(`[${new Date().toISOString()}] ${value}`);
            const saved = options.spuId === undefined
                ? await (0, spuRepository_1.createSpu)(message.draft, logger)
                : await (0, spuRepository_1.updateSpu)(options.spuId, message.draft, logger);
            panel.title = `SPU ${saved.id} — ${saved.name}`;
            await panel.webview.postMessage({ command: 'spuSaved', saved });
            void Promise.resolve(onSaved()).catch(error => {
                output.appendLine(`[${new Date().toISOString()}] SPU сохранён, но список не обновлён: ${errorMessage(error)}`);
            });
            void vscode.window.showInformationMessage(`SPU ${saved.id} ${editing ? 'сохранён' : 'создан'}. Пакетный файл: ${saved.fileId}.`);
        }
        catch (error) {
            output.appendLine(`[${new Date().toISOString()}] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
            output.show(true);
            await panel.webview.postMessage({ command: 'spuSaveFailed', message: errorMessage(error) });
        }
        finally {
            saving = false;
        }
    });
    panel.onDidDispose(() => {
        panels.delete(panel);
        output.dispose();
    });
}
function closeSpuEditorPanels() {
    for (const panel of panels) {
        panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'spu-editor.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csp-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Редактор SPU</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=spuEditorPanel.js.map