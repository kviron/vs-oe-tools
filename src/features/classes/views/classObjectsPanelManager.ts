import * as vscode from 'vscode';
import { isClassObjectsWebviewMessage, type ClassObjectsHostMessage } from '../../../core/webviewProtocol';
import { classObjectPageSize, getClassObjects } from '../../../infrastructure/database/classObjectRepository';
import { openObjectView } from './objectViewPanelManager';
import { openEntityProperties } from './entityPropertiesPanelManager';

const panels = new Map<number, vscode.WebviewPanel>();

export async function openClassObjects(context: vscode.ExtensionContext, classId: number): Promise<void> {
	const existing = panels.get(classId);
	if (existing) {
		existing.reveal(vscode.ViewColumn.Active);
		return;
	}
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.classObjects',
		`Объекты класса ${classId}`,
		vscode.ViewColumn.Active,
		{ enableScripts: true, localResourceRoots: [assetsRoot] },
	);
	panels.set(classId, panel);
	panel.webview.html = shell(panel.webview, assetsRoot);
	let loading = false;
	const load = async (offset = 0): Promise<void> => {
		if (loading) {
			return;
		}
		loading = true;
		const append = offset > 0;
		await panel.webview.postMessage({ command: 'classObjectsLoading', append } satisfies ClassObjectsHostMessage);
		try {
			const result = await getClassObjects(classId, offset, classObjectPageSize);
			panel.title = `Справочник — ${result.className}`;
			await panel.webview.postMessage({ command: 'classObjectsLoaded', result, append } satisfies ClassObjectsHostMessage);
		} catch (error) {
			await panel.webview.postMessage({ command: 'classObjectsLoadFailed', message: error instanceof Error ? error.message : String(error) } satisfies ClassObjectsHostMessage);
		} finally {
			loading = false;
		}
	};
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isClassObjectsWebviewMessage(message)) {
			return;
		}
		if (message.command === 'copyTableCells') {
			await vscode.env.clipboard.writeText(message.text);
			return;
		}
		if (message.command === 'copyEntityId') {
			await vscode.env.clipboard.writeText(String(message.id));
			return;
		}
		if (message.command === 'openClientEntity') {
			await vscode.commands.executeCommand('vc-ve-tools.openClientEntity', message.role, message.entityType, message.id);
			return;
		}
		if (message.command === 'viewObject') {
			await openObjectView(context, message.id);
			return;
		}
		if (message.command === 'viewEntityProperties') {
			await openEntityProperties(context, message.id);
			return;
		}
		await load(message.command === 'loadMoreClassObjects' ? message.offset : 0);
	});
	panel.onDidDispose(() => panels.delete(classId));
}

export function closeClassObjectPanels(): void {
	for (const panel of panels.values()) {
		panel.dispose();
	}
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-objects.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-objects.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Объекты класса</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
