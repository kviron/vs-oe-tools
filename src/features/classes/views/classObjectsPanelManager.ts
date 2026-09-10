import * as vscode from 'vscode';
import { isClassObjectsWebviewMessage, type ClassObjectsHostMessage } from '../../../core/webviewProtocol';
import { classObjectPageSize, getClassObjects } from '../../../infrastructure/database/classObjectRepository';
import { openObjectView } from './objectViewPanelManager';
import { openEntityProperties } from './entityPropertiesPanelManager';
import { openSpuEditor } from '../../spu/spuEditorPanel';
import { classObjectColumnSettingsKey, normalizeClassObjectColumnSettings } from '../classObjectColumnSettings';

interface ClassObjectsPanelController {
	panel: vscode.WebviewPanel;
	revealObject(objectId: number): Promise<void>;
}

const panels = new Map<number, ClassObjectsPanelController>();

export async function openClassObjects(context: vscode.ExtensionContext, classId: number, objectId?: number): Promise<void> {
	const existing = panels.get(classId);
	if (existing) {
		existing.panel.reveal(vscode.ViewColumn.Active);
		if (objectId !== undefined) {
			await existing.revealObject(objectId);
		}
		return;
	}
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.classObjects',
		`Объекты класса ${classId}`,
		vscode.ViewColumn.Active,
		{ enableScripts: true, localResourceRoots: [assetsRoot] },
	);
	panel.webview.html = shell(panel.webview, assetsRoot);
	let ready = false;
	let selectedObjectId = objectId;
	const performLoad = async (offset = 0, targetObjectId?: number): Promise<void> => {
		const append = offset > 0;
		await panel.webview.postMessage({ command: 'classObjectsLoading', append } satisfies ClassObjectsHostMessage);
		try {
			const result = await getClassObjects(classId, offset, classObjectPageSize, targetObjectId);
			const columnSettings = append ? undefined : normalizeClassObjectColumnSettings(
				result.columns.map(column => column.key),
				context.workspaceState.get(classObjectColumnSettingsKey(classId)),
			);
			panel.title = `Справочник — ${result.className}`;
			await panel.webview.postMessage({ command: 'classObjectsLoaded', result, append, columnSettings } satisfies ClassObjectsHostMessage);
			if (targetObjectId !== undefined) {
				await panel.webview.postMessage({ command: 'revealClassObject', objectId: targetObjectId } satisfies ClassObjectsHostMessage);
			}
		} catch (error) {
			await panel.webview.postMessage({ command: 'classObjectsLoadFailed', message: error instanceof Error ? error.message : String(error) } satisfies ClassObjectsHostMessage);
		}
	};
	let loadQueue = Promise.resolve();
	const load = (offset = 0, targetObjectId?: number): Promise<void> => {
		const operation = loadQueue.then(() => performLoad(offset, targetObjectId));
		loadQueue = operation.catch(() => undefined);
		return operation;
	};
	const controller: ClassObjectsPanelController = {
		panel,
		revealObject: async targetObjectId => {
			selectedObjectId = targetObjectId;
			if (ready) {
				await load(0, targetObjectId);
			}
		},
	};
	panels.set(classId, controller);
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
			if (classId === 12609684) {
				await openSpuEditor(context, { spuId: message.id }, () => load(0));
				return;
			}
			await openObjectView(context, message.id);
			return;
		}
		if (message.command === 'viewEntityProperties') {
			await openEntityProperties(context, message.id);
			return;
		}
		if (message.command === 'createSpu') {
			if (classId !== 12609684) { return; }
			await openSpuEditor(context, { preferredPackageName: message.preferredPackageName }, () => load(0));
			return;
		}
		if (message.command === 'saveClassObjectColumnSettings') {
			const availableKeys = message.settings.order;
			const settings = normalizeClassObjectColumnSettings(availableKeys, message.settings);
			await context.workspaceState.update(classObjectColumnSettingsKey(classId), settings);
			return;
		}
		if (message.command === 'classObjectsReady') {
			ready = true;
			await load(0, selectedObjectId);
			return;
		}
		if (message.command === 'refreshClassObjects') {
			await load(0, selectedObjectId);
			return;
		}
		await load(message.offset);
	});
	panel.onDidDispose(() => panels.delete(classId));
}

export function closeClassObjectPanels(): void {
	for (const controller of panels.values()) {
		controller.panel.dispose();
	}
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-objects.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Объекты класса</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
