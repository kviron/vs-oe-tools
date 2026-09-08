import * as vscode from 'vscode';
import type { ProductionTaskDetailsHostMessage } from '../../core/webviewProtocol';
import { isProductionTaskDetailsWebviewMessage } from '../../core/webviewProtocol';
import type { DatabaseObjectSearchResult } from '../../core/objectSearch';
import type { ProductionTaskAttachment, ProductionTaskSummary } from './models';

const panels = new Map<number, vscode.WebviewPanel>();

export function openProductionTaskDetails(
	context: vscode.ExtensionContext,
	task: ProductionTaskSummary,
	findObjectById: (id: number) => Promise<DatabaseObjectSearchResult | undefined>,
	loadAttachments: () => Promise<ProductionTaskAttachment[]>,
): void {
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
		if (message.command === 'copyTableCells') {
			await vscode.env.clipboard.writeText(message.text);
			return;
		}
		if (message.command === 'tableSelectionDebug') { return; }
		if (message.command === 'loadProductionTaskAttachments') {
			await panel.webview.postMessage({ command: 'productionTaskAttachmentsLoading' } satisfies ProductionTaskDetailsHostMessage);
			try {
				const attachments = await loadAttachments();
				await panel.webview.postMessage({ command: 'productionTaskAttachmentsLoaded', attachments } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'productionTaskAttachmentsFailed',
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
			return;
		}
		if (message.command === 'openDatabaseObjectById') {
			await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', message.id);
			return;
		}
		if (message.command === 'loadDatabaseObjectPreview') {
			try {
				const object = await findObjectById(message.id);
				await panel.webview.postMessage({ command: 'databaseObjectPreviewLoaded', id: message.id, object } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'databaseObjectPreviewFailed', id: message.id,
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
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
