import * as vscode from 'vscode';
import type { ProductionTaskDetailsHostMessage } from '../../core/webviewProtocol';
import { isProductionTaskDetailsWebviewMessage } from '../../core/webviewProtocol';
import type { ProductionTaskSummary } from './models';

const panels = new Map<number, vscode.WebviewPanel>();

export function openProductionTaskDetails(context: vscode.ExtensionContext, task: ProductionTaskSummary): void {
	const existing = panels.get(task.id);
	if (existing) { existing.reveal(vscode.ViewColumn.Active); return; }
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.productionTaskDetails', `Задача ${task.number || task.id}`, vscode.ViewColumn.Active, {
		enableScripts: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
	});
	panels.set(task.id, panel);
	panel.webview.html = shell(panel.webview, assetsRoot);
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isProductionTaskDetailsWebviewMessage(message)) { return; }
		if (message.command === 'productionTaskDetailsReady') {
			await panel.webview.postMessage({ command: 'productionTaskDetailsLoaded', task } satisfies ProductionTaskDetailsHostMessage);
			return;
		}
		const uri = vscode.Uri.parse(`https://dev.oe-it.ru/oe-ric224:/open/РаботаДокумент/${message.id}`);
		if (!await vscode.env.openExternal(uri)) { void vscode.window.showErrorMessage(`Не удалось открыть задачу ${message.id} в клиенте.`); }
	});
	panel.onDidDispose(() => panels.delete(task.id));
}

export function closeProductionTaskDetailsPanels(): void {
	for (const panel of panels.values()) { panel.dispose(); }
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-task-details.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-task-details.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задача</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
