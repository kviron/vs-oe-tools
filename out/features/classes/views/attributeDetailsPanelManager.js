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
exports.onDidChangeAttribute = void 0;
exports.openAttributeDetails = openAttributeDetails;
exports.openNewAttributeDetails = openNewAttributeDetails;
exports.closeAttributeDetailPanels = closeAttributeDetailPanels;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const classRepository_1 = require("../../../infrastructure/database/classRepository");
const attributeRepository_1 = require("../../../infrastructure/database/attributeRepository");
const nativeAttributeEditing_1 = require("../nativeAttributeEditing");
const nativeAttributeService_1 = require("../nativeAttributeService");
const panels = new Map();
const changes = new vscode.EventEmitter();
exports.onDidChangeAttribute = changes.event;
async function openAttributeDetails(context, attributeId, edit = false) {
    const databaseKey = await (0, nativeAttributeService_1.attributeDatabaseKey)();
    const key = `${databaseKey}:attribute:${attributeId}`;
    const existing = panels.get(key);
    if (existing) {
        existing.panel.reveal(vscode.ViewColumn.Active);
        if (edit && existing.mode === 'view' && !existing.busy && !existing.blocked) {
            existing.mode = 'edit';
            postDetails(existing);
        }
        return;
    }
    const details = await (0, classRepository_1.getClassAttributeDetails)(attributeId);
    const options = await (0, attributeRepository_1.getAttributeEditorOptions)(Number(details.ownerClassId));
    const draft = (0, nativeAttributeEditing_1.attributeDraft)(details);
    createPanel(context, { key, databaseKey, details, options, draft, baseline: { ...draft }, mode: edit ? 'edit' : 'view', busy: false });
}
async function openNewAttributeDetails(context, ownerClassId, onCreated) {
    const databaseKey = await (0, nativeAttributeService_1.attributeDatabaseKey)();
    const key = `${databaseKey}:new:${ownerClassId}`;
    const existing = panels.get(key);
    if (existing) {
        existing.panel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const options = await (0, attributeRepository_1.getAttributeEditorOptions)(ownerClassId);
    const binding = await (0, nativeAttributeService_1.attributePackage)(ownerClassId);
    const draft = { ownerClassId, name: '', attributeTypeId: options.types.find(item => item.id === 353)?.id ?? options.types[0]?.id ?? 0,
        valueClass: '', storageInDb: false, dbFieldName: '', isHistoric: false, isStatic: false,
        isComputedBy: false, computedByExpression: '', sysPackage: binding.name };
    createPanel(context, { key, databaseKey, options, draft, mode: 'create', busy: false, onCreated });
}
function createPanel(context, initial) {
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.attributeDetails', initial.details ? `Атрибут ${initial.details.name}` : `Новый атрибут — ${initial.options.ownerClassName}`, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true });
    const entry = { ...initial, panel, context };
    panels.set(entry.key, entry);
    panel.webview.onDidReceiveMessage(message => { void handleMessage(entry, message); });
    panel.onDidDispose(() => { if (panels.get(entry.key) === entry) {
        panels.delete(entry.key);
    } });
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
    panel.webview.html = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src ${panel.webview.cspSource} 'nonce-${nonce}';">
<link rel="stylesheet" href="${panel.webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'))}"><title>Атрибут</title></head>
<body><div id="app">Загрузка атрибута…</div><script type="module" nonce="${nonce}" src="${panel.webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'attribute-details.js'))}"></script></body></html>`;
}
function closeAttributeDetailPanels() {
    for (const { panel } of [...panels.values()]) {
        panel.dispose();
    }
    panels.clear();
}
function postDetails(entry) {
    void entry.panel.webview.postMessage({ command: 'attributeEditorState', details: entry.details, options: entry.options,
        draft: entry.draft, mode: entry.mode, busy: entry.busy, error: entry.error, warning: entry.warning, blocked: entry.blocked });
}
async function handleMessage(entry, message) {
    if (!(0, webviewProtocol_1.isAttributeDetailsWebviewMessage)(message)) {
        return;
    }
    if (message.command === 'attributeDetailsReady') {
        postDetails(entry);
        return;
    }
    if (entry.busy) {
        return;
    }
    // Take the lock before the first await, including database validation.
    entry.busy = true;
    if (!entry.blocked && ['attributeSave', 'attributeEdit', 'attributeCancel', 'attributeRefresh'].includes(message.command)) {
        entry.error = undefined;
    }
    try {
        if (await (0, nativeAttributeService_1.attributeDatabaseKey)() !== entry.databaseKey) {
            throw new Error('База или проект изменились. Откройте карточку заново.');
        }
        if (message.command === 'attributeCopyId') {
            if (entry.details) {
                await vscode.env.clipboard.writeText(entry.details.id);
            }
            return;
        }
        if (message.command === 'attributeOpenOwner') {
            await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', entry.options.ownerClassId, 'object');
            return;
        }
        if (message.command === 'attributeNew') {
            if (entry.blocked) {
                throw new Error('Сначала проверьте результат предыдущего сохранения и привязку к пакету.');
            }
            await openNewAttributeDetails(entry.context, entry.options.ownerClassId);
            return;
        }
        if (message.command === 'attributeCancel') {
            if (!entry.details) {
                entry.panel.dispose();
                return;
            }
            entry.draft = (0, nativeAttributeEditing_1.attributeDraft)(entry.details);
            entry.mode = 'view';
            return;
        }
        if (message.command === 'attributeRefresh' && entry.mode === 'view' && entry.details) {
            entry.details = await (0, classRepository_1.getClassAttributeDetails)(Number(entry.details.id));
            entry.draft = (0, nativeAttributeEditing_1.attributeDraft)(entry.details);
            entry.baseline = { ...entry.draft };
            return;
        }
        if (message.command === 'attributeEdit' && entry.details && !entry.blocked) {
            entry.mode = 'edit';
            return;
        }
        if (message.command !== 'attributeSave' || entry.mode === 'view' || entry.blocked) {
            return;
        }
        if (message.draft.ownerClassId !== entry.options.ownerClassId) {
            throw new Error('Нельзя менять класс-владелец из карточки атрибута.');
        }
        entry.draft = { ...message.draft };
        entry.busy = true;
        postDetails(entry);
        const id = entry.details ? Number(entry.details.id) : undefined;
        // Native physical-attribute operations may also change the underlying table.
        if ((entry.draft.storageInDb || entry.baseline?.storageInDb)
            && (!entry.baseline || ['storageInDb', 'dbFieldName', 'attributeTypeId', 'isHistoric', 'isStatic', 'isComputedBy'].some(key => entry.draft[key] !== entry.baseline?.[key]))) {
            const confirmed = await vscode.window.showWarningMessage('Изменение хранимого атрибута может изменить структуру таблицы. Продолжить?', { modal: true }, 'Сохранить');
            if (confirmed !== 'Сохранить') {
                return;
            }
        }
        const saved = await (0, nativeAttributeService_1.saveNativeAttribute)(entry.draft, entry.databaseKey, entry.baseline, id);
        // Once the native call succeeded, a failed UI reload must never enable a second add.
        entry.blocked = true;
        entry.warning = saved.warning;
        try {
            entry.details = await (0, classRepository_1.getClassAttributeDetails)(saved.id);
        }
        catch (error) {
            throw new nativeAttributeService_1.AttributeSaveUncertainError(`Атрибут ${saved.id} сохранён, но карточку не удалось обновить: ${String(error)}`, saved.id);
        }
        panels.delete(entry.key);
        entry.key = `${entry.databaseKey}:attribute:${saved.id}`;
        panels.set(entry.key, entry);
        entry.draft = (0, nativeAttributeEditing_1.attributeDraft)(entry.details);
        entry.baseline = { ...entry.draft };
        entry.mode = 'view';
        entry.blocked = Boolean(saved.warning);
        entry.panel.title = `Атрибут ${entry.details.name}`;
        changes.fire({ id: saved.id, ownerClassId: entry.options.ownerClassId });
        if (id === undefined) {
            await entry.onCreated?.(saved.id);
        }
    }
    catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        if (error instanceof nativeAttributeService_1.AttributeSaveUncertainError) {
            entry.blocked = true;
        }
    }
    finally {
        entry.busy = false;
        postDetails(entry);
    }
}
//# sourceMappingURL=attributeDetailsPanelManager.js.map