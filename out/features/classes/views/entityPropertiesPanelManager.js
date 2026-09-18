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
exports.configureEntityPropertiesActions = configureEntityPropertiesActions;
exports.openEntityProperties = openEntityProperties;
exports.closeEntityPropertiesPanels = closeEntityPropertiesPanels;
const vscode = __importStar(require("vscode"));
const methodRepository_1 = require("../../../infrastructure/database/methodRepository");
const objectViewRepository_1 = require("../../../infrastructure/database/objectViewRepository");
const panels = new Map();
let openMethodCode;
function configureEntityPropertiesActions(actions) {
    openMethodCode = actions.openMethodCode;
    return new vscode.Disposable(() => { openMethodCode = undefined; });
}
async function openEntityProperties(context, objectId) {
    const existing = panels.get(objectId);
    if (existing) {
        existing.panel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const loaded = await load(objectId);
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.entityProperties', `Свойства — ${loaded.result.name || loaded.result.id}`, vscode.ViewColumn.Active, {
        enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
    });
    const entry = { panel, objectId, ...loaded, busy: false };
    panels.set(objectId, entry);
    panel.webview.html = shell(panel.webview, assetsRoot);
    panel.webview.onDidReceiveMessage(message => { void handleMessage(entry, message); });
    panel.onDidDispose(() => panels.delete(objectId));
}
async function load(objectId) {
    const result = await (0, objectViewRepository_1.getObjectView)(objectId);
    const attributes = Object.fromEntries(result.fields.filter(field => field.kind === 'attribute').map(field => [field.tableField.toLocaleLowerCase(), field.value]));
    if (Number(result.classId) !== 5) {
        return { result: { ...result, fields: result.fields.filter(field => field.kind === 'property') }, attributes };
    }
    const source = await (0, methodRepository_1.getMethodSource)(objectId);
    const field = (...names) => {
        const normalized = names.map(name => name.toLocaleLowerCase('ru'));
        return result.fields.find(item => normalized.includes(item.attributeName.toLocaleLowerCase('ru')))?.value;
    };
    const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const method = {
        id: source.id, name: source.name,
        aliases: String(attributes.aliases ?? ''), fullName: String(attributes.fullname ?? ''),
        ownerClassId: source.seniorId, ownerClassName: result.ownerName ?? '', packageName: result.packageName ?? '',
        methodType: source.methodType, methodKind: number(attributes.methkind),
        visibility: String(field('ОбластьВидимости', 'Видимость') ?? attributes.visibility ?? ''),
        signature: source.signature,
    };
    return { result: { ...result, fields: result.fields.filter(item => item.kind === 'property') }, attributes, method };
}
function post(entry) {
    void entry.panel.webview.postMessage({ command: 'entityPropertiesLoaded', result: entry.result, attributes: entry.attributes,
        method: entry.method, busy: entry.busy, error: entry.error });
}
async function handleMessage(entry, message) {
    if (!isMessage(message)) {
        return;
    }
    if (message.command === 'entityPropertiesReady') {
        post(entry);
        return;
    }
    if (entry.busy) {
        return;
    }
    entry.busy = true;
    entry.error = undefined;
    try {
        if (message.command === 'methodPropertiesCopyId') {
            await vscode.env.clipboard.writeText(String(entry.objectId));
            return;
        }
        if (message.command === 'methodPropertiesOpenCode') {
            await openMethodCode?.(entry.objectId);
            return;
        }
        if (message.command === 'methodPropertiesOpenOwner' && entry.method) {
            await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', entry.method.ownerClassId, 'object');
            return;
        }
        if (message.command === 'entityPropertiesRefresh') {
            Object.assign(entry, await load(entry.objectId));
        }
    }
    catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
    }
    finally {
        entry.busy = false;
        post(entry);
    }
}
function isMessage(message) {
    if (!message || typeof message !== 'object' || !('command' in message)) {
        return false;
    }
    return ['entityPropertiesReady', 'entityPropertiesRefresh', 'methodPropertiesCopyId', 'methodPropertiesOpenOwner', 'methodPropertiesOpenCode'].includes(String(message.command));
}
function closeEntityPropertiesPanels() {
    for (const { panel } of panels.values()) {
        panel.dispose();
    }
    panels.clear();
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'entity-properties.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Свойства</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=entityPropertiesPanelManager.js.map