import * as vscode from 'vscode';
import { isObjectViewWebviewMessage, type ObjectViewHostMessage } from '../../../core/webviewProtocol';
import { logTableSelection } from '../../../core/tableSelectionLogger';
import { getObjectView } from '../../../infrastructure/database/objectViewRepository';
import type { ObjectViewResult } from '../models';

interface Entry { panel: vscode.WebviewPanel; result?: ObjectViewResult }
const panels = new Map<number, Entry>();

export async function openObjectView(context: vscode.ExtensionContext, objectId: number): Promise<void> {
	const existing = panels.get(objectId);
	if (existing) { existing.panel.reveal(vscode.ViewColumn.Active); return; }
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.objectView', `Просмотр объекта ${objectId}`, vscode.ViewColumn.Active, {
		enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
	});
	const entry: Entry = { panel };
	panels.set(objectId, entry);
	panel.webview.html = shell(panel.webview, assetsRoot);
	const load = async (): Promise<void> => {
		await panel.webview.postMessage({ command: 'objectViewLoading' } satisfies ObjectViewHostMessage);
		try {
			entry.result = await getObjectView(objectId);
			panel.title = `Просмотр объекта ${entry.result.name || entry.result.id}`;
			await panel.webview.postMessage({ command: 'objectViewLoaded', result: entry.result } satisfies ObjectViewHostMessage);
		} catch (error) {
			await panel.webview.postMessage({ command: 'objectViewLoadFailed', message: error instanceof Error ? error.message : String(error) } satisfies ObjectViewHostMessage);
		}
	};
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isObjectViewWebviewMessage(message)) {
			return;
		}
		if (message.command === 'objectViewReady' || message.command === 'refreshObjectView') { await load(); return; }
		if (message.command === 'copyTableCells') { await vscode.env.clipboard.writeText(message.text); return; }
		if (message.command === 'tableSelectionDebug') { logTableSelection('Просмотр объекта', message.message); return; }
		if (entry.result) {
			await vscode.env.clipboard.writeText(JSON.stringify(entry.result, null, 2));
			vscode.window.setStatusBarMessage('Объект скопирован в буфер обмена как JSON', 1800);
		}
	});
	panel.onDidDispose(() => panels.delete(objectId));
}

export function closeObjectViewPanels(): void {
	for (const entry of panels.values()) {
		entry.panel.dispose();
	}
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'object-view.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'object-view.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Просмотр объекта</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
