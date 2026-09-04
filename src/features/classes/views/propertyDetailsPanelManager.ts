import * as vscode from 'vscode';
import { isPropertyDetailsWebviewMessage, type PropertyDetailsHostMessage } from '../../../core/webviewProtocol';
import { getClassPropertyDetails } from '../../../infrastructure/database/classRepository';
import type { PropertyDetails } from '../models';

interface Entry { panel: vscode.WebviewPanel; details: PropertyDetails }
const panels = new Map<number, Entry>();

export async function openPropertyDetails(context: vscode.ExtensionContext, propertyId: number): Promise<void> {
	const existing = panels.get(propertyId);
	if (existing) {
		existing.panel.reveal(vscode.ViewColumn.Active);
		return;
	}
	const details = await getClassPropertyDetails(propertyId);
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.propertyDetails', `Свойство ${details.name}`, vscode.ViewColumn.Active, {
		enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
	});
	const entry = { panel, details };
	panels.set(propertyId, entry);
	panel.webview.html = shell(panel.webview, assetsRoot);
	panel.webview.onDidReceiveMessage((message: unknown) => {
		if (isPropertyDetailsWebviewMessage(message)) {
			void panel.webview.postMessage({ command: 'propertyDetailsLoaded', details: entry.details } satisfies PropertyDetailsHostMessage);
		}
	});
	panel.onDidDispose(() => panels.delete(propertyId));
}

export function closePropertyDetailPanels(): void {
	for (const entry of panels.values()) {
		entry.panel.dispose();
	}
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'property-details.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'property-details.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Свойство</title></head><body><div id="app">Загрузка свойства…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
