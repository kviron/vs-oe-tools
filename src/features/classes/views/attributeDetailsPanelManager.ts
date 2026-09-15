import * as vscode from 'vscode';
import { isAttributeDetailsWebviewMessage, type AttributeDetailsHostMessage } from '../../../core/webviewProtocol';
import { getClassAttributeDetails } from '../../../infrastructure/database/classRepository';
import { getAttributeEditorOptions } from '../../../infrastructure/database/attributeRepository';
import type { AttributeDetails, AttributeEditorOptions } from '../models';
import { attributeDraft, type NativeAttributeDraft } from '../nativeAttributeEditing';
import { attributeDatabaseKey, attributePackage, AttributeSaveUncertainError, saveNativeAttribute } from '../nativeAttributeService';

interface AttributeDetailsPanel {
	panel: vscode.WebviewPanel;
	context: vscode.ExtensionContext;
	key: string;
	databaseKey: string;
	details?: AttributeDetails;
	options: AttributeEditorOptions;
	draft: NativeAttributeDraft;
	baseline?: NativeAttributeDraft;
	mode: 'view' | 'edit' | 'create';
	busy: boolean;
	error?: string;
	warning?: string;
	blocked?: boolean;
	onCreated?: (attributeId: number) => Promise<void> | void;
}

const panels = new Map<string, AttributeDetailsPanel>();
const changes = new vscode.EventEmitter<{ id: number; ownerClassId: number }>();
export const onDidChangeAttribute = changes.event;

export async function openAttributeDetails(context: vscode.ExtensionContext, attributeId: number, edit = false): Promise<void> {
	const databaseKey = await attributeDatabaseKey();
	const key = `${databaseKey}:attribute:${attributeId}`;
	const existing = panels.get(key);
	if (existing) {
		existing.panel.reveal(vscode.ViewColumn.Active);
		if (edit && existing.mode === 'view' && !existing.busy && !existing.blocked) { existing.mode = 'edit'; postDetails(existing); }
		return;
	}
	const details = await getClassAttributeDetails(attributeId);
	const options = await getAttributeEditorOptions(Number(details.ownerClassId));
	const draft = attributeDraft(details);
	createPanel(context, { key, databaseKey, details, options, draft, baseline: { ...draft }, mode: edit ? 'edit' : 'view', busy: false });
}

export async function openNewAttributeDetails(context: vscode.ExtensionContext, ownerClassId: number,
	onCreated?: (attributeId: number) => Promise<void> | void): Promise<void> {
	const databaseKey = await attributeDatabaseKey();
	const key = `${databaseKey}:new:${ownerClassId}`;
	const existing = panels.get(key);
	if (existing) { existing.panel.reveal(vscode.ViewColumn.Active); return; }
	const options = await getAttributeEditorOptions(ownerClassId);
	const binding = await attributePackage(ownerClassId);
	const draft: NativeAttributeDraft = { ownerClassId, name: '', attributeTypeId: options.types.find(item => item.id === 353)?.id ?? options.types[0]?.id ?? 0,
		valueClass: '', storageInDb: false, dbFieldName: '', isHistoric: false, isStatic: false,
		isComputedBy: false, computedByExpression: '', sysPackage: binding.name };
	createPanel(context, { key, databaseKey, options, draft, mode: 'create', busy: false, onCreated });
}

function createPanel(context: vscode.ExtensionContext, initial: Omit<AttributeDetailsPanel, 'panel' | 'context'>): void {
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.attributeDetails',
		initial.details ? `Атрибут ${initial.details.name}` : `Новый атрибут — ${initial.options.ownerClassName}`,
		vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true });
	const entry: AttributeDetailsPanel = { ...initial, panel, context };
	panels.set(entry.key, entry);
	panel.webview.onDidReceiveMessage(message => { void handleMessage(entry, message); });
	panel.onDidDispose(() => { if (panels.get(entry.key) === entry) {panels.delete(entry.key);} });
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
	panel.webview.html = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src ${panel.webview.cspSource} 'nonce-${nonce}';">
<link rel="stylesheet" href="${panel.webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'))}"><title>Атрибут</title></head>
<body><div id="app">Загрузка атрибута…</div><script type="module" nonce="${nonce}" src="${panel.webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'attribute-details.js'))}"></script></body></html>`;
}

export function closeAttributeDetailPanels(): void {
	for (const { panel } of [...panels.values()]) {panel.dispose();}
	panels.clear();
}

function postDetails(entry: AttributeDetailsPanel): void {
	void entry.panel.webview.postMessage({ command: 'attributeEditorState', details: entry.details, options: entry.options,
		draft: entry.draft, mode: entry.mode, busy: entry.busy, error: entry.error, warning: entry.warning, blocked: entry.blocked } satisfies AttributeDetailsHostMessage);
}

async function handleMessage(entry: AttributeDetailsPanel, message: unknown): Promise<void> {
	if (!isAttributeDetailsWebviewMessage(message)) {return;}
	if (message.command === 'attributeDetailsReady') { postDetails(entry); return; }
	if (entry.busy) {return;}
	// Take the lock before the first await, including database validation.
	entry.busy = true;
	if (!entry.blocked && ['attributeSave', 'attributeEdit', 'attributeCancel', 'attributeRefresh'].includes(message.command)) { entry.error = undefined; }
	try {
		if (await attributeDatabaseKey() !== entry.databaseKey) {throw new Error('База или проект изменились. Откройте карточку заново.');}
		if (message.command === 'attributeCopyId') { if (entry.details) {await vscode.env.clipboard.writeText(entry.details.id);} return; }
		if (message.command === 'attributeOpenOwner') { await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', entry.options.ownerClassId, 'object'); return; }
		if (message.command === 'attributeNew') {
			if (entry.blocked) {throw new Error('Сначала проверьте результат предыдущего сохранения и привязку к пакету.');}
			await openNewAttributeDetails(entry.context, entry.options.ownerClassId); return;
		}
		if (message.command === 'attributeCancel') {
			if (!entry.details) { entry.panel.dispose(); return; }
			entry.draft = attributeDraft(entry.details); entry.mode = 'view'; return;
		}
		if (message.command === 'attributeRefresh' && entry.mode === 'view' && entry.details) {
			entry.details = await getClassAttributeDetails(Number(entry.details.id));
			entry.draft = attributeDraft(entry.details); entry.baseline = { ...entry.draft }; return;
		}
		if (message.command === 'attributeEdit' && entry.details && !entry.blocked) { entry.mode = 'edit'; return; }
		if (message.command !== 'attributeSave' || entry.mode === 'view' || entry.blocked) {return;}
		if (message.draft.ownerClassId !== entry.options.ownerClassId) {throw new Error('Нельзя менять класс-владелец из карточки атрибута.');}
		entry.draft = { ...message.draft }; entry.busy = true; postDetails(entry);
		const id = entry.details ? Number(entry.details.id) : undefined;
		// Native physical-attribute operations may also change the underlying table.
		if ((entry.draft.storageInDb || entry.baseline?.storageInDb)
			&& (!entry.baseline || ['storageInDb', 'dbFieldName', 'attributeTypeId', 'isHistoric', 'isStatic', 'isComputedBy'].some(key => entry.draft[key as keyof NativeAttributeDraft] !== entry.baseline?.[key as keyof NativeAttributeDraft]))) {
			const confirmed = await vscode.window.showWarningMessage('Изменение хранимого атрибута может изменить структуру таблицы. Продолжить?', { modal: true }, 'Сохранить');
			if (confirmed !== 'Сохранить') {return;}
		}
		const saved = await saveNativeAttribute(entry.draft, entry.databaseKey, entry.baseline, id);
		// Once the native call succeeded, a failed UI reload must never enable a second add.
		entry.blocked = true;
		entry.warning = saved.warning;
		try { entry.details = await getClassAttributeDetails(saved.id); }
		catch (error) { throw new AttributeSaveUncertainError(`Атрибут ${saved.id} сохранён, но карточку не удалось обновить: ${String(error)}`, saved.id); }
		panels.delete(entry.key); entry.key = `${entry.databaseKey}:attribute:${saved.id}`; panels.set(entry.key, entry);
		entry.draft = attributeDraft(entry.details); entry.baseline = { ...entry.draft }; entry.mode = 'view';
		entry.blocked = Boolean(saved.warning); entry.panel.title = `Атрибут ${entry.details.name}`;
		changes.fire({ id: saved.id, ownerClassId: entry.options.ownerClassId });
		if (id === undefined) {await entry.onCreated?.(saved.id);}
	} catch (error) {
		entry.error = error instanceof Error ? error.message : String(error);
		if (error instanceof AttributeSaveUncertainError) {entry.blocked = true;}
	} finally { entry.busy = false; postDetails(entry); }
}
