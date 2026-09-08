import * as vscode from 'vscode';
import { isAttributeDetailsWebviewMessage, type AttributeDetailsHostMessage } from '../../../core/webviewProtocol';
import { getClassAttributeDetails } from '../../../infrastructure/database/classRepository';
import { createClassAttribute, getAttributeEditorOptions } from '../../../infrastructure/database/attributeRepository';
import { defaultAttributeDistributionModeId, defaultAttributeVisibilityId } from '../attributeCreation';
import type { AttributeDetails, AttributeEditorOptions, ClassAttributeDraft } from '../models';

interface AttributeDetailsPanel {
	panel: vscode.WebviewPanel;
	details?: AttributeDetails;
	options?: AttributeEditorOptions;
	draft?: ClassAttributeDraft;
	key: string;
	onCreated?: (attributeId: number) => Promise<void> | void;
}

const panels = new Map<string, AttributeDetailsPanel>();

export async function openAttributeDetails(context: vscode.ExtensionContext, attributeId: number): Promise<void> {
	const key = `attribute:${attributeId}`;
	const existing = panels.get(key);
	if (existing) {
		existing.panel.reveal(vscode.ViewColumn.Active);
		return;
	}
	const details = await getClassAttributeDetails(attributeId);
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.attributeDetails',
		`Атрибут ${details.name}`,
		vscode.ViewColumn.Active,
		{ enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true },
	);
	const entry: AttributeDetailsPanel = { panel, details, key };
	panels.set(key, entry);
	panel.webview.html = getAttributeDetailsShell(panel.webview, assetsRoot);
	registerPanelMessages(entry);
	panel.onDidDispose(() => panels.delete(entry.key));
}

export async function openNewAttributeDetails(
	context: vscode.ExtensionContext,
	ownerClassId: number,
	onCreated?: (attributeId: number) => Promise<void> | void,
): Promise<void> {
	const key = `new:${ownerClassId}`;
	const existing = panels.get(key);
	if (existing) { existing.panel.reveal(vscode.ViewColumn.Active); return; }
	const options = await getAttributeEditorOptions(ownerClassId);
	const draft: ClassAttributeDraft = {
		ownerClassId,
		name: '',
		aliases: '',
		dbFieldName: '',
		attributeTypeId: options.types[0]?.id ?? 0,
		valueClasses: '',
		visibilityId: options.defaults.visibilityId ?? defaultAttributeVisibilityId,
		distributionModeId: options.defaults.distributionModeId ?? defaultAttributeDistributionModeId,
		isNotNull: false,
		virtual: true,
		refIntegrityCheck: false,
	};
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.attributeDetails', `Новый атрибут — ${options.ownerClassName}`,
		vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true });
	const entry: AttributeDetailsPanel = { panel, options, draft, key, onCreated };
	panels.set(key, entry);
	panel.webview.html = getAttributeDetailsShell(panel.webview, assetsRoot);
	registerPanelMessages(entry);
	panel.onDidDispose(() => panels.delete(entry.key));
}

export function closeAttributeDetailPanels(): void {
	for (const { panel } of [...panels.values()]) {
		panel.dispose();
	}
	panels.clear();
}

function postDetails(entry: AttributeDetailsPanel): void {
	if (entry.details) {
		void entry.panel.webview.postMessage({ command: 'attributeDetailsLoaded', details: entry.details } satisfies AttributeDetailsHostMessage);
	} else if (entry.options && entry.draft) {
		void entry.panel.webview.postMessage({ command: 'attributeCreationInitialized', options: entry.options, draft: entry.draft } satisfies AttributeDetailsHostMessage);
	}
}

function registerPanelMessages(entry: AttributeDetailsPanel): void {
	entry.panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isAttributeDetailsWebviewMessage(message)) { return; }
		if (message.command === 'attributeDetailsReady') { postDetails(entry); return; }
		if (!entry.options || message.draft.ownerClassId !== entry.options.ownerClassId) {
			void entry.panel.webview.postMessage({ command: 'attributeCreationFailed', message: 'Класс-владелец формы изменён.' } satisfies AttributeDetailsHostMessage);
			return;
		}
		void entry.panel.webview.postMessage({ command: 'attributeCreating' } satisfies AttributeDetailsHostMessage);
		try {
			const created = await createClassAttribute(message.draft);
			const details = await getClassAttributeDetails(created.id);
			panels.delete(entry.key);
			entry.key = `attribute:${created.id}`;
			entry.details = details;
			entry.options = undefined;
			entry.draft = undefined;
			panels.set(entry.key, entry);
			entry.panel.title = `Атрибут ${details.name}`;
			void entry.panel.webview.postMessage({ command: 'attributeCreated', details } satisfies AttributeDetailsHostMessage);
			await entry.onCreated?.(created.id);
			void vscode.window.showInformationMessage(`Атрибут ${details.name} (ID ${created.id}) создан.`);
		} catch (error) {
			void entry.panel.webview.postMessage({ command: 'attributeCreationFailed', message: error instanceof Error ? error.message : String(error) } satisfies AttributeDetailsHostMessage);
		}
	});
}

function getAttributeDetailsShell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'attribute-details.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'attribute-details.css'));
	const nonce = createNonce();
	return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>Атрибут</title></head>
<body><div id="app">Загрузка атрибута…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
