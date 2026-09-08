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
exports.openClassObjects = openClassObjects;
exports.closeClassObjectPanels = closeClassObjectPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const classObjectRepository_1 = require("../../../infrastructure/database/classObjectRepository");
const objectViewPanelManager_1 = require("./objectViewPanelManager");
const entityPropertiesPanelManager_1 = require("./entityPropertiesPanelManager");
const spuEditorPanel_1 = require("../../spu/spuEditorPanel");
const panels = new Map();
async function openClassObjects(context, classId, objectId) {
    const existing = panels.get(classId);
    if (existing) {
        existing.panel.reveal(vscode.ViewColumn.Active);
        if (objectId !== undefined) {
            await existing.revealObject(objectId);
        }
        return;
    }
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.classObjects', `Объекты класса ${classId}`, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [assetsRoot] });
    panel.webview.html = shell(panel.webview, assetsRoot);
    let ready = false;
    let selectedObjectId = objectId;
    const performLoad = async (offset = 0, targetObjectId) => {
        const append = offset > 0;
        await panel.webview.postMessage({ command: 'classObjectsLoading', append });
        try {
            const result = await (0, classObjectRepository_1.getClassObjects)(classId, offset, classObjectRepository_1.classObjectPageSize, targetObjectId);
            panel.title = `Справочник — ${result.className}`;
            await panel.webview.postMessage({ command: 'classObjectsLoaded', result, append });
            if (targetObjectId !== undefined) {
                await panel.webview.postMessage({ command: 'revealClassObject', objectId: targetObjectId });
            }
        }
        catch (error) {
            await panel.webview.postMessage({ command: 'classObjectsLoadFailed', message: error instanceof Error ? error.message : String(error) });
        }
    };
    let loadQueue = Promise.resolve();
    const load = (offset = 0, targetObjectId) => {
        const operation = loadQueue.then(() => performLoad(offset, targetObjectId));
        loadQueue = operation.catch(() => undefined);
        return operation;
    };
    const controller = {
        panel,
        revealObject: async (targetObjectId) => {
            selectedObjectId = targetObjectId;
            if (ready) {
                await load(0, targetObjectId);
            }
        },
    };
    panels.set(classId, controller);
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!(0, webviewProtocol_1.isClassObjectsWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'copyTableCells') {
            await vscode.env.clipboard.writeText(message.text);
            return;
        }
        if (message.command === 'copyEntityId') {
            await vscode.env.clipboard.writeText(String(message.id));
            return;
        }
        if (message.command === 'openClientEntity') {
            await vscode.commands.executeCommand('vc-ve-tools.openClientEntity', message.role, message.entityType, message.id);
            return;
        }
        if (message.command === 'viewObject') {
            if (classId === 12609684) {
                await (0, spuEditorPanel_1.openSpuEditor)(context, { spuId: message.id }, () => load(0));
                return;
            }
            await (0, objectViewPanelManager_1.openObjectView)(context, message.id);
            return;
        }
        if (message.command === 'viewEntityProperties') {
            await (0, entityPropertiesPanelManager_1.openEntityProperties)(context, message.id);
            return;
        }
        if (message.command === 'createSpu') {
            if (classId !== 12609684) {
                return;
            }
            await (0, spuEditorPanel_1.openSpuEditor)(context, { preferredPackageName: message.preferredPackageName }, () => load(0));
            return;
        }
        if (message.command === 'classObjectsReady') {
            ready = true;
            await load(0, selectedObjectId);
            return;
        }
        if (message.command === 'refreshClassObjects') {
            await load(0, selectedObjectId);
            return;
        }
        await load(message.offset);
    });
    panel.onDidDispose(() => panels.delete(classId));
}
function closeClassObjectPanels() {
    for (const controller of panels.values()) {
        controller.panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-objects.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-objects.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Объекты класса</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=classObjectsPanelManager.js.map