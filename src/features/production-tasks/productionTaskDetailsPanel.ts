import * as vscode from 'vscode';
import type { ProductionTaskDetailsHostMessage } from '../../core/webviewProtocol';
import { isProductionTaskDetailsWebviewMessage } from '../../core/webviewProtocol';
import type { DatabaseObjectSearchResult } from '../../core/objectSearch';
import type { ProductionTaskAction, ProductionTaskAttachment, ProductionTaskHistoryEntry, ProductionTaskSummary } from './models';
import { productionTaskClientUri } from './productionTaskPresentation';
import { convertProductionTaskWmfImages, parseProductionTaskRichDescription } from './productionTaskRichText';

const panels = new Map<number, vscode.WebviewPanel>();

export function openProductionTaskDetails(
	context: vscode.ExtensionContext,
	task: ProductionTaskSummary,
	findObjectById: (id: number) => Promise<DatabaseObjectSearchResult | undefined>,
	loadTaskReference: (reference: number) => Promise<ProductionTaskSummary | undefined>,
	openTaskReference: (task: ProductionTaskSummary) => void,
	loadActions: () => Promise<ProductionTaskAction[]>,
	loadAttachments: () => Promise<ProductionTaskAttachment[]>,
	loadHistory: () => Promise<ProductionTaskHistoryEntry[]>,
	loadRichDescription: () => Promise<string>,
): void {
	const existing = panels.get(task.id);
	if (existing) { existing.reveal(vscode.ViewColumn.Active); return; }
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel('vc-ve-tools.productionTaskDetails', `Задача ${task.number || task.id}`, vscode.ViewColumn.Active, {
		enableScripts: true, enableFindWidget: true, localResourceRoots: [assetsRoot], retainContextWhenHidden: true,
	});
	panels.set(task.id, panel);
	const attachments = new Map<number, ProductionTaskAttachment>();
	const taskPreviews = new Map<number, ProductionTaskSummary | undefined>();
	panel.webview.html = shell(panel.webview, assetsRoot);
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isProductionTaskDetailsWebviewMessage(message)) { return; }
		if (message.command === 'productionTaskDetailsReady') {
			await panel.webview.postMessage({ command: 'productionTaskDetailsLoaded', task } satisfies ProductionTaskDetailsHostMessage);
			await panel.webview.postMessage({ command: 'productionTaskRichDescriptionLoading' } satisfies ProductionTaskDetailsHostMessage);
			try {
				const parts = await convertProductionTaskWmfImages(parseProductionTaskRichDescription(await loadRichDescription()));
				await panel.webview.postMessage({ command: 'productionTaskRichDescriptionLoaded', parts } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'productionTaskRichDescriptionFailed',
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
			return;
		}
		if (message.command === 'copyTableCells') {
			await vscode.env.clipboard.writeText(message.text);
			return;
		}
		if (message.command === 'loadProductionTaskActions') {
			await panel.webview.postMessage({ command: 'productionTaskActionsLoading' } satisfies ProductionTaskDetailsHostMessage);
			try {
				const actions = await loadActions();
				await panel.webview.postMessage({ command: 'productionTaskActionsLoaded', actions } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'productionTaskActionsFailed',
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
			return;
		}
		if (message.command === 'tableSelectionDebug') { return; }
		if (message.command === 'loadProductionTaskAttachments') {
			await panel.webview.postMessage({ command: 'productionTaskAttachmentsLoading' } satisfies ProductionTaskDetailsHostMessage);
			try {
				const loaded = await loadAttachments();
				attachments.clear();
				for (const attachment of loaded) { attachments.set(attachment.id, attachment); }
				await panel.webview.postMessage({ command: 'productionTaskAttachmentsLoaded', attachments: loaded } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'productionTaskAttachmentsFailed',
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
			return;
		}
		if (message.command === 'loadProductionTaskHistory') {
			await panel.webview.postMessage({ command: 'productionTaskHistoryLoading' } satisfies ProductionTaskDetailsHostMessage);
			try {
				const history = await loadHistory();
				await panel.webview.postMessage({ command: 'productionTaskHistoryLoaded', history } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'productionTaskHistoryFailed',
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
			return;
		}
		if (message.command === 'loadProductionTaskPreview') {
			try {
				const preview = await loadTaskReference(message.id);
				taskPreviews.set(message.id, preview);
				await panel.webview.postMessage({ command: 'productionTaskPreviewLoaded', id: message.id, task: preview } satisfies ProductionTaskDetailsHostMessage);
			} catch (error) {
				await panel.webview.postMessage({
					command: 'productionTaskPreviewFailed', id: message.id,
					message: error instanceof Error ? error.message : String(error),
				} satisfies ProductionTaskDetailsHostMessage);
			}
			return;
		}
		if (message.command === 'openProductionTaskReference') {
			try {
				const referencedTask = taskPreviews.has(message.id) ? taskPreviews.get(message.id) : await loadTaskReference(message.id);
				if (referencedTask) { openTaskReference(referencedTask); }
				else { void vscode.window.showInformationMessage(`Задача ${message.id} не найдена.`); }
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось открыть задачу ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}
		if (message.command === 'productionTaskAttachmentAction') {
			const attachment = attachments.get(message.id);
			if (attachment) {
				try { await performAttachmentAction(attachment, message.action); }
				catch (error) { void vscode.window.showErrorMessage(`Не удалось обработать вложение ${message.id}: ${error instanceof Error ? error.message : String(error)}`); }
			}
			return;
		}
		if (message.command === 'openExternalUrl') {
			await vscode.env.openExternal(vscode.Uri.parse(message.url));
			return;
		}
		if (message.command === 'openDatabaseObjectById') {
			await vscode.commands.executeCommand('vc-ve-tools.openClipboardObject', message.id, message.target);
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
		const reference = task.number.trim() || task.id;
		const uri = vscode.Uri.parse(productionTaskClientUri(reference));
		if (!await vscode.env.openExternal(uri)) { void vscode.window.showErrorMessage(`Не удалось открыть задачу ${reference} в клиенте.`); }
	});
	panel.onDidDispose(() => panels.delete(task.id));
}

async function performAttachmentAction(attachment: ProductionTaskAttachment, action: 'open' | 'preview' | 'save' | 'reveal'): Promise<void> {
	const source = await resolveAttachmentUri(attachment);
	if (!source) {
		const selection = await vscode.window.showInformationMessage(
			`Файл «${attachment.fileName || attachment.name}» хранится во внутреннем хранилище Восточного Экспресса.`,
			'Открыть вложение в клиенте',
		);
		if (selection === 'Открыть вложение в клиенте') { await openAttachmentInClient(attachment.id); }
		return;
	}
	if (action === 'save') {
		const destination = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(attachment.fileName || attachment.name || `attachment-${attachment.id}`) });
		if (destination) { await vscode.workspace.fs.copy(source, destination, { overwrite: true }); }
		return;
	}
	if (action === 'reveal') {
		await vscode.commands.executeCommand('revealFileInOS', source);
		return;
	}
	if (action === 'preview') {
		await vscode.commands.executeCommand('vscode.open', source, { preview: true });
		return;
	}
	if (!await vscode.env.openExternal(source)) { void vscode.window.showErrorMessage(`Не удалось открыть вложение ${attachment.id}.`); }
}

async function resolveAttachmentUri(attachment: ProductionTaskAttachment): Promise<vscode.Uri | undefined> {
	const value = attachment.storageFileId.trim();
	if (!value || /^\d+$/.test(value)) { return undefined; }
	const isWindowsPath = /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value);
	const uri = isWindowsPath || !/^[a-z][a-z\d+.-]*:/i.test(value) ? vscode.Uri.file(value) : vscode.Uri.parse(value);
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		return stat.type === vscode.FileType.File ? uri : undefined;
	} catch { return undefined; }
}

async function openAttachmentInClient(id: number): Promise<void> {
	const uri = vscode.Uri.parse(`https://dev.oe-it.ru/oe-ric224:/open/StoredFiles/${id}`);
	if (!await vscode.env.openExternal(uri)) { void vscode.window.showErrorMessage(`Не удалось открыть вложение ${id} в клиенте.`); }
}

export function closeProductionTaskDetailsPanels(): void {
	for (const panel of panels.values()) { panel.dispose(); }
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-task-details.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задача</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
