import * as vscode from 'vscode';
import type { ClassDetailsHostMessage } from '../../../core/webviewProtocol';
import { isClassDetailsWebviewMessage } from '../../../core/webviewProtocol';
import { getClassAttributes, getClassDetails, getClassMethods } from '../../../infrastructure/database/classRepository';
import type { ClassDetails } from '../models';
import type { MethodEditorProvider } from '../../methods/methodEditorProvider';

interface ClassDetailPanel {
	panel: vscode.WebviewPanel;
	pinned: boolean;
	details: ClassDetails;
}

const classDetailPanels = new Map<number, ClassDetailPanel>();
let previewClassPanelId: number | undefined;

function postDetails(entry: ClassDetailPanel): void {
	const message: ClassDetailsHostMessage = { command: 'classDetailsLoaded', details: entry.details };
	void entry.panel.webview.postMessage(message);
}

function updateClassDetailPanel(entry: ClassDetailPanel, classDetails: ClassDetails): void {
	entry.details = classDetails;
	entry.panel.title = `Класс ${classDetails.name}`;
	postDetails(entry);
	entry.panel.reveal(vscode.ViewColumn.Active, !entry.pinned);
}

function createPanel(context: vscode.ExtensionContext, classDetails: ClassDetails, pinned: boolean, methodEditor: MethodEditorProvider): ClassDetailPanel {
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.classDetails',
		`Класс ${classDetails.name}`,
		{ viewColumn: vscode.ViewColumn.Active, preserveFocus: !pinned },
		{ enableScripts: true, localResourceRoots: [assetsRoot] },
	);
	const entry: ClassDetailPanel = { panel, pinned, details: classDetails };
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (isClassDetailsWebviewMessage(message)) {
			if (message.command === 'copyEntityId') {
				await vscode.env.clipboard.writeText(String(message.id));
				vscode.window.setStatusBarMessage(`ID ${message.id} скопирован`, 1500);
				return;
			}
			if (message.command === 'classDetailsReady') {
				postDetails(entry);
				return;
			}
			if (message.command === 'openMethod') {
				await methodEditor.open(message.id);
				return;
			}
			const requestedClassId = entry.details.id;
			if (message.command === 'loadClassMethods') {
				const includeInherited = message.includeInherited;
				try {
					const methods = await getClassMethods(requestedClassId, entry.details.name, includeInherited);
					if (entry.details.id === requestedClassId) {
						void panel.webview.postMessage({ command: 'classMethodsLoaded', methods, includeInherited } satisfies ClassDetailsHostMessage);
					}
				} catch (error) {
					if (entry.details.id === requestedClassId) {
						const failureMessage = error instanceof Error ? error.message : String(error);
						void panel.webview.postMessage({ command: 'classMethodsLoadFailed', message: failureMessage, includeInherited } satisfies ClassDetailsHostMessage);
					}
				}
				return;
			}
			try {
				const attributes = await getClassAttributes(requestedClassId, entry.details.name);
				if (entry.details.id === requestedClassId) {
					void panel.webview.postMessage({ command: 'classAttributesLoaded', attributes } satisfies ClassDetailsHostMessage);
				}
			} catch (error) {
				const failureMessage = error instanceof Error ? error.message : String(error);
				void panel.webview.postMessage({ command: 'classAttributesLoadFailed', message: failureMessage } satisfies ClassDetailsHostMessage);
			}
		}
	});
	panel.webview.html = getClassDetailsShell(panel.webview, assetsRoot);
	return entry;
}

export async function openClassDetails(context: vscode.ExtensionContext, methodEditor: MethodEditorProvider, id: number, pinned: boolean): Promise<void> {
	const existingPanel = classDetailPanels.get(id);
	if (existingPanel) {
		if (pinned && !existingPanel.pinned) {
			existingPanel.pinned = true;
			previewClassPanelId = undefined;
		}
		existingPanel.panel.reveal(vscode.ViewColumn.Active, !pinned);
		return;
	}
	const classDetails = await getClassDetails(id);
	const previousPreviewPanelId = previewClassPanelId;
	const previewPanel = previousPreviewPanelId === undefined ? undefined : classDetailPanels.get(previousPreviewPanelId);
	if (previewPanel && previousPreviewPanelId !== undefined && !previewPanel.pinned) {
		classDetailPanels.delete(previousPreviewPanelId);
		classDetailPanels.set(id, previewPanel);
		previewPanel.pinned = pinned;
		previewClassPanelId = pinned ? undefined : id;
		updateClassDetailPanel(previewPanel, classDetails);
		return;
	}
	const entry = createPanel(context, classDetails, pinned, methodEditor);
	classDetailPanels.set(id, entry);
	if (!pinned) {
		previewClassPanelId = id;
	}
	entry.panel.onDidDispose(() => {
		for (const [panelId, candidate] of classDetailPanels) {
			if (candidate.panel === entry.panel) {
				classDetailPanels.delete(panelId);
				if (previewClassPanelId === panelId) {
					previewClassPanelId = undefined;
				}
			}
		}
	});
}

export function closeClassDetailPanels(): void {
	for (const { panel } of [...classDetailPanels.values()]) {
		panel.dispose();
	}
	classDetailPanels.clear();
	previewClassPanelId = undefined;
}

function getClassDetailsShell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-details.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'class-details.css'));
	const nonce = createNonce();
	return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>Класс</title></head>
<body><div id="app">Загрузка класса…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
