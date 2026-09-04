import * as vscode from 'vscode';
import { isAttributeDetailsWebviewMessage, type AttributeDetailsHostMessage } from '../../../core/webviewProtocol';
import { getClassAttributeDetails } from '../../../infrastructure/database/classRepository';
import type { AttributeDetails } from '../models';

interface AttributeDetailsPanel {
	panel: vscode.WebviewPanel;
	details: AttributeDetails;
}

const panels = new Map<number, AttributeDetailsPanel>();

export async function openAttributeDetails(context: vscode.ExtensionContext, attributeId: number): Promise<void> {
	const existing = panels.get(attributeId);
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
	const entry = { panel, details };
	panels.set(attributeId, entry);
	panel.webview.html = getAttributeDetailsShell(panel.webview, assetsRoot);
	panel.webview.onDidReceiveMessage((message: unknown) => {
		if (isAttributeDetailsWebviewMessage(message)) {
			postDetails(entry);
		}
	});
	panel.onDidDispose(() => panels.delete(attributeId));
}

export function closeAttributeDetailPanels(): void {
	for (const { panel } of [...panels.values()]) {
		panel.dispose();
	}
	panels.clear();
}

function postDetails(entry: AttributeDetailsPanel): void {
	void entry.panel.webview.postMessage({ command: 'attributeDetailsLoaded', details: entry.details } satisfies AttributeDetailsHostMessage);
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
