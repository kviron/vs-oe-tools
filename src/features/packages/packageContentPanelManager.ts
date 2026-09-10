import * as vscode from 'vscode';
import type { DatabaseObjectKind } from '../../core/objectSearch';
import { isPackageContentWebviewMessage, type PackageContentHostMessage } from '../../core/webviewProtocol';
import { logTableSelection } from '../../core/tableSelectionLogger';
import { loadPackageFileContent } from '../../infrastructure/database/packageExplorerRepository';
import type { PackageFileContent } from './models';

interface Entry { panel: vscode.WebviewPanel; result?: PackageFileContent; selectedObjectId?: number }
const panels = new Map<number, Entry>();

export async function openPackageContent(
	context: vscode.ExtensionContext,
	fileId: number,
	objectId: number | undefined,
	openObject: (id: number, kind: DatabaseObjectKind) => Promise<void>,
): Promise<void> {
	const existing = panels.get(fileId);
	if (existing) {
		existing.selectedObjectId = objectId;
		existing.panel.reveal(vscode.ViewColumn.Active);
		if (objectId !== undefined) { await existing.panel.webview.postMessage({ command: 'revealPackageContentObject', objectId } satisfies PackageContentHostMessage); }
		return;
	}
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.packageContent', `Содержимое файла ${fileId}`, vscode.ViewColumn.Active, {
		enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
	});
	const entry: Entry = { panel, selectedObjectId: objectId };
	panels.set(fileId, entry);
	panel.webview.html = shell(panel.webview, assetsRoot);
	const load = async (): Promise<void> => {
		await panel.webview.postMessage({ command: 'packageContentLoading' } satisfies PackageContentHostMessage);
		try {
			entry.result = await loadPackageFileContent(fileId);
			panel.title = entry.result.fileName;
			await panel.webview.postMessage({ command: 'packageContentLoaded', result: entry.result, selectedObjectId: entry.selectedObjectId } satisfies PackageContentHostMessage);
		} catch (error) {
			await panel.webview.postMessage({ command: 'packageContentLoadFailed', message: error instanceof Error ? error.message : String(error) } satisfies PackageContentHostMessage);
		}
	};
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isPackageContentWebviewMessage(message)) { return; }
		if (message.command === 'packageContentReady' || message.command === 'refreshPackageContent') { await load(); return; }
		if (message.command === 'copyTableCells') { await vscode.env.clipboard.writeText(message.text); return; }
		if (message.command === 'tableSelectionDebug') { logTableSelection('Содержимое пакета', message.message); return; }
		await openObject(message.id, message.kind);
	});
	panel.onDidDispose(() => panels.delete(fileId));
}

export function closePackageContentPanels(): void {
	for (const entry of panels.values()) { entry.panel.dispose(); }
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'package-content.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Содержимое файла пакета</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
