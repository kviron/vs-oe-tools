import * as vscode from 'vscode';
import { getObjectView } from '../../../infrastructure/database/objectViewRepository';

const panels = new Map<number, vscode.WebviewPanel>();

export async function openEntityProperties(context: vscode.ExtensionContext, objectId: number): Promise<void> {
	const existing = panels.get(objectId);
	if (existing) { existing.reveal(vscode.ViewColumn.Active); return; }
	const result = await getObjectView(objectId);
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.entityProperties', `Свойства — ${result.name || result.id}`, vscode.ViewColumn.Active, {
		enableScripts: true, localResourceRoots: [assetsRoot],
	});
	panels.set(objectId, panel);
	panel.webview.html = shell(panel.webview, assetsRoot);
	panel.webview.onDidReceiveMessage((message: unknown) => {
		if (typeof message === 'object' && message !== null && 'command' in message && message.command === 'entityPropertiesReady') {
			const attributes = Object.fromEntries(result.fields.filter(field => field.kind === 'attribute').map(field => [field.tableField.toLocaleLowerCase(), field.value]));
			void panel.webview.postMessage({ command: 'entityPropertiesLoaded', result: { ...result, fields: result.fields.filter(field => field.kind === 'property') }, attributes });
		}
	});
	panel.onDidDispose(() => panels.delete(objectId));
}

export function closeEntityPropertiesPanels(): void {
	for (const panel of panels.values()) {
		panel.dispose();
	}
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'entity-properties.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'entity-properties.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Свойства</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
