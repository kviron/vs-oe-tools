import * as vscode from 'vscode';
import type { ClassDetailsHostMessage } from '../../../core/webviewProtocol';
import { isClassDetailsWebviewMessage } from '../../../core/webviewProtocol';
import { getClassAttributes, getClassDetails, getClassMethods, getClassProperties } from '../../../infrastructure/database/classRepository';
import type { ClassDetails } from '../models';
import type { MethodEditorProvider } from '../../methods/methodEditorProvider';
import { logTableSelection } from '../../../core/tableSelectionLogger';
import { openAttributeDetails } from './attributeDetailsPanelManager';
import { openPropertyDetails } from './propertyDetailsPanelManager';
import { openClassObjects } from './classObjectsPanelManager';
import { openObjectView } from './objectViewPanelManager';
import { openEntityProperties } from './entityPropertiesPanelManager';

interface ClassDetailPanel {
	panel: vscode.WebviewPanel;
	pinned: boolean;
	details: ClassDetails;
	activeTab: string;
	ready: boolean;
	pendingMethodId?: number;
}

function postPendingMethod(entry: ClassDetailPanel): void {
	if (!entry.ready || entry.pendingMethodId === undefined) {
		return;
	}
	const methodId = entry.pendingMethodId;
	entry.pendingMethodId = undefined;
	void entry.panel.webview.postMessage({ command: 'revealClassMethod', methodId } satisfies ClassDetailsHostMessage);
}

const classDetailPanels = new Map<number, ClassDetailPanel>();
let previewClassPanelId: number | undefined;

function postDetails(entry: ClassDetailPanel): void {
	const message: ClassDetailsHostMessage = { command: 'classDetailsLoaded', details: entry.details, activeTab: entry.activeTab };
	void entry.panel.webview.postMessage(message);
}

function updateClassDetailPanel(entry: ClassDetailPanel, classDetails: ClassDetails): void {
	entry.details = classDetails;
	entry.panel.title = `Класс ${classDetails.name}`;
	postDetails(entry);
	entry.panel.reveal(vscode.ViewColumn.Active, !entry.pinned);
}

function persistPanels(context: vscode.ExtensionContext): void {
	void context.workspaceState.update('classDetails.openPanels', [...classDetailPanels.values()].map(entry => ({ id: entry.details.id, pinned: entry.pinned, activeTab: entry.activeTab })));
}

function createPanel(context: vscode.ExtensionContext, classDetails: ClassDetails, pinned: boolean, methodEditor: MethodEditorProvider, activeTab = 'class'): ClassDetailPanel {
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.classDetails',
		`Класс ${classDetails.name}`,
		{ viewColumn: vscode.ViewColumn.Active, preserveFocus: !pinned },
		{ enableScripts: true, localResourceRoots: [assetsRoot] },
	);
	panel.webview.html = getClassDetailsShell(panel.webview, assetsRoot);
	const entry: ClassDetailPanel = { panel, pinned, details: classDetails, activeTab, ready: false };
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (isClassDetailsWebviewMessage(message)) {
			if (message.command === 'classDetailsStateChanged') {
				entry.activeTab = message.activeTab;
				persistPanels(context);
				return;
			}
			if (message.command === 'tableSelectionDebug') {
				logTableSelection('Класс', message.message);
				return;
			}
			if (message.command === 'copyEntityId') {
				const ids = String(message.id);
				logTableSelection('Класс', `Контекстное меню copyEntityId: ${JSON.stringify(ids)}.`);
				try {
					await vscode.env.clipboard.writeText(ids);
					logTableSelection('Класс', 'ID записаны в буфер успешно.');
					vscode.window.setStatusBarMessage(`ID ${ids} скопирован`, 1500);
				} catch (error) {
					logTableSelection('Класс', `Ошибка копирования ID: ${error instanceof Error ? error.message : String(error)}.`);
					void vscode.window.showErrorMessage(`Не удалось скопировать ID: ${error instanceof Error ? error.message : String(error)}`);
				}
				return;
			}
			if (message.command === 'copyTableCells') {
				logTableSelection('Класс', `extension host получил copyTableCells: символов=${message.text.length}, текст=${JSON.stringify(message.text.slice(0, 300))}.`);
				try {
					await vscode.env.clipboard.writeText(message.text);
					logTableSelection('Класс', 'vscode.env.clipboard.writeText завершён успешно.');
					vscode.window.setStatusBarMessage('Выделенные ячейки скопированы', 1500);
				} catch (error) {
					logTableSelection('Класс', `Ошибка записи в буфер: ${error instanceof Error ? error.message : String(error)}.`);
					void vscode.window.showErrorMessage(`Не удалось скопировать ячейки: ${error instanceof Error ? error.message : String(error)}`);
				}
				return;
			}
			if (message.command === 'classDetailsReady') {
				entry.ready = true;
				postDetails(entry);
				postPendingMethod(entry);
				return;
			}
			if (message.command === 'openMethod') {
				await methodEditor.open(message.id);
				return;
			}
			if (message.command === 'openAttribute') {
				try {
					await openAttributeDetails(context, message.id);
				} catch (error) {
					void vscode.window.showErrorMessage(`Не удалось открыть атрибут: ${error instanceof Error ? error.message : String(error)}`);
				}
				return;
			}
			if (message.command === 'openProperty') {
				try {
					await openPropertyDetails(context, message.id);
				} catch (error) {
					void vscode.window.showErrorMessage(`Не удалось открыть свойство: ${error instanceof Error ? error.message : String(error)}`);
				}
				return;
			}
			if (message.command === 'openClassObjects') {
				await openClassObjects(context, message.classId);
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
			if (message.command === 'methodSvnAction') {
				const command = message.action === 'localDiff' ? 'vc-ve-tools.svnLocalDiff' : message.action === 'history' ? 'vc-ve-tools.svnHistory' : 'vc-ve-tools.svnBlame';
				await vscode.commands.executeCommand(command, message.id);
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
			if (message.command === 'loadClassProperties') {
				const includeInherited = message.includeInherited;
				try {
					const properties = await getClassProperties(requestedClassId, includeInherited);
					if (entry.details.id === requestedClassId) {
						void panel.webview.postMessage({ command: 'classPropertiesLoaded', properties, includeInherited } satisfies ClassDetailsHostMessage);
					}
				} catch (error) {
					if (entry.details.id === requestedClassId) {
						void panel.webview.postMessage({ command: 'classPropertiesLoadFailed', message: error instanceof Error ? error.message : String(error), includeInherited } satisfies ClassDetailsHostMessage);
					}
				}
				return;
			}
			const includeInherited = message.includeInherited;
			try {
				const attributes = await getClassAttributes(requestedClassId, entry.details.name, includeInherited);
				if (entry.details.id === requestedClassId) {
					void panel.webview.postMessage({ command: 'classAttributesLoaded', attributes, includeInherited } satisfies ClassDetailsHostMessage);
				}
			} catch (error) {
				const failureMessage = error instanceof Error ? error.message : String(error);
				void panel.webview.postMessage({ command: 'classAttributesLoadFailed', message: failureMessage, includeInherited } satisfies ClassDetailsHostMessage);
			}
		}
	});
	return entry;
}

export async function openClassDetails(context: vscode.ExtensionContext, methodEditor: MethodEditorProvider, id: number, pinned: boolean, activeTab = 'class'): Promise<void> {
	const existingPanel = classDetailPanels.get(id);
	if (existingPanel) {
		if (pinned && !existingPanel.pinned) {
			existingPanel.pinned = true;
			previewClassPanelId = undefined;
		}
		persistPanels(context);
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
		persistPanels(context);
		return;
	}
	const entry = createPanel(context, classDetails, pinned, methodEditor, activeTab);
	classDetailPanels.set(id, entry);
	persistPanels(context);
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
				persistPanels(context);
			}
		}
	});
}

export async function revealClassMethod(
	context: vscode.ExtensionContext,
	methodEditor: MethodEditorProvider,
	classId: number,
	methodId: number,
): Promise<void> {
	await openClassDetails(context, methodEditor, classId, true, 'methods');
	const entry = classDetailPanels.get(classId);
	if (!entry) {
		throw new Error(`Не удалось открыть карточку класса ${classId}.`);
	}
	entry.activeTab = 'methods';
	entry.pendingMethodId = methodId;
	persistPanels(context);
	postDetails(entry);
	entry.panel.reveal(vscode.ViewColumn.Active);
	postPendingMethod(entry);
}

export async function restoreClassDetailPanels(context: vscode.ExtensionContext, methodEditor: MethodEditorProvider): Promise<void> {
	const panels = context.workspaceState.get<Array<{ id: number; pinned: boolean; activeTab: string }>>('classDetails.openPanels', []);
	for (const panel of panels) {
		if (Number.isSafeInteger(panel.id)) {
			await openClassDetails(context, methodEditor, panel.id, panel.pinned, panel.activeTab);
		}
	}
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
