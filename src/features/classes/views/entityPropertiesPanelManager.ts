import * as vscode from 'vscode';
import type { EntityPropertiesHostMessage } from '../../../core/webviewProtocol';
import { getMethodSource } from '../../../infrastructure/database/methodRepository';
import { getObjectView } from '../../../infrastructure/database/objectViewRepository';
import type { MethodPropertiesDetails, ObjectViewResult } from '../models';

interface EntityPropertiesPanel {
	panel: vscode.WebviewPanel;
	objectId: number;
	result: ObjectViewResult;
	attributes: Record<string, unknown>;
	method?: MethodPropertiesDetails;
	busy: boolean;
	error?: string;
}

const panels = new Map<number, EntityPropertiesPanel>();
let openMethodCode: ((id: number) => Promise<void>) | undefined;

export function configureEntityPropertiesActions(actions: { openMethodCode(id: number): Promise<void> }): vscode.Disposable {
	openMethodCode = actions.openMethodCode;
	return new vscode.Disposable(() => { openMethodCode = undefined; });
}

export async function openEntityProperties(context: vscode.ExtensionContext, objectId: number): Promise<void> {
	const existing = panels.get(objectId);
	if (existing) { existing.panel.reveal(vscode.ViewColumn.Active); return; }
	const loaded = await load(objectId);
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.entityProperties', `Свойства — ${loaded.result.name || loaded.result.id}`, vscode.ViewColumn.Active, {
		enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
	});
	const entry: EntityPropertiesPanel = { panel, objectId, ...loaded, busy: false };
	panels.set(objectId, entry);
	panel.webview.html = shell(panel.webview, assetsRoot);
	panel.webview.onDidReceiveMessage(message => { void handleMessage(entry, message); });
	panel.onDidDispose(() => panels.delete(objectId));
}

async function load(objectId: number): Promise<Pick<EntityPropertiesPanel, 'result' | 'attributes' | 'method'>> {
	const result = await getObjectView(objectId);
	const attributes = Object.fromEntries(result.fields.filter(field => field.kind === 'attribute').map(field => [field.tableField.toLocaleLowerCase(), field.value]));
	if (Number(result.classId) !== 5) { return { result: { ...result, fields: result.fields.filter(field => field.kind === 'property') }, attributes }; }
	const source = await getMethodSource(objectId);
	const field = (...names: string[]) => {
		const normalized = names.map(name => name.toLocaleLowerCase('ru'));
		return result.fields.find(item => normalized.includes(item.attributeName.toLocaleLowerCase('ru')))?.value;
	};
	const number = (value: unknown): number | null => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
	const method: MethodPropertiesDetails = {
		id: source.id, name: source.name,
		aliases: String(attributes.aliases ?? ''), fullName: String(attributes.fullname ?? ''),
		ownerClassId: source.seniorId, ownerClassName: result.ownerName ?? '', packageName: result.packageName ?? '',
		methodType: source.methodType, methodKind: number(attributes.methkind),
		visibility: String(field('ОбластьВидимости', 'Видимость') ?? attributes.visibility ?? ''),
		signature: source.signature,
	};
	return { result: { ...result, fields: result.fields.filter(item => item.kind === 'property') }, attributes, method };
}

function post(entry: EntityPropertiesPanel): void {
	void entry.panel.webview.postMessage({ command: 'entityPropertiesLoaded', result: entry.result, attributes: entry.attributes,
		method: entry.method, busy: entry.busy, error: entry.error } satisfies EntityPropertiesHostMessage);
}

async function handleMessage(entry: EntityPropertiesPanel, message: unknown): Promise<void> {
	if (!isMessage(message)) { return; }
	if (message.command === 'entityPropertiesReady') { post(entry); return; }
	if (entry.busy) { return; }
	entry.busy = true;
	entry.error = undefined;
	try {
		if (message.command === 'methodPropertiesCopyId') { await vscode.env.clipboard.writeText(String(entry.objectId)); return; }
		if (message.command === 'methodPropertiesOpenCode') { await openMethodCode?.(entry.objectId); return; }
		if (message.command === 'methodPropertiesOpenOwner' && entry.method) {
			await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', entry.method.ownerClassId, 'object'); return;
		}
		if (message.command === 'entityPropertiesRefresh') { Object.assign(entry, await load(entry.objectId)); }
	} catch (error) {
		entry.error = error instanceof Error ? error.message : String(error);
	} finally { entry.busy = false; post(entry); }
}

function isMessage(message: unknown): message is { command: 'entityPropertiesReady' | 'entityPropertiesRefresh' | 'methodPropertiesCopyId' | 'methodPropertiesOpenOwner' | 'methodPropertiesOpenCode' } {
	if (!message || typeof message !== 'object' || !('command' in message)) { return false; }
	return ['entityPropertiesReady', 'entityPropertiesRefresh', 'methodPropertiesCopyId', 'methodPropertiesOpenOwner', 'methodPropertiesOpenCode'].includes(String(message.command));
}

export function closeEntityPropertiesPanels(): void {
	for (const { panel } of panels.values()) { panel.dispose(); }
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'entity-properties.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Свойства</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
