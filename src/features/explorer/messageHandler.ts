import * as vscode from 'vscode';
import type { ExplorerHostMessage, ExplorerWebviewMessage } from '../../core/webviewProtocol';
import type { DatabaseObjectKind } from '../../core/objectSearch';
import type { ExplorerDependencies } from './explorerViewProvider';

export interface ExplorerMessageActions {
	log(message: string): void;
	postMessage(message: ExplorerHostMessage): Promise<void>;
	setSelectedEntityId(id: number | undefined): void;
	sendClasses(): Promise<void>;
	sendPackages(): Promise<void>;
	sendPackageTree(id: number): Promise<void>;
	sendPackageFileObjects(id: number): Promise<void>;
	sendObjectSearch(query: string): Promise<void>;
	openDatabaseObject(id: number, kind: DatabaseObjectKind, pinned: boolean): Promise<void>;
}

type Command = ExplorerWebviewMessage['command'];
type Handlers = { [K in Command]: (message: Extract<ExplorerWebviewMessage, { command: K }>) => void };

function reportError(operation: string, error: unknown): void {
	void vscode.window.showErrorMessage(`${operation}: ${error instanceof Error ? error.message : String(error)}`);
}

/** Each validated command has one typed handler; adding a command requires an entry here. */
export function createExplorerMessageHandler(dependencies: ExplorerDependencies, actions: ExplorerMessageActions): (message: ExplorerWebviewMessage) => void {
	const handlers = {
		explorerDebugLog: (value) => actions.log(`[webview] ${value.message}`),
		explorerReady: () => {
			const state = dependencies.workspaceState.get<{ activeTab: string; selectedClassId?: number; selectedPackageId?: number }>('explorer.state', { activeTab: 'packages' });
			void actions.postMessage({ command: 'restoreExplorerState', ...state });
		},
		explorerStateChanged: (value) => {
			actions.setSelectedEntityId(value.selectedClassId);
			void dependencies.workspaceState.update('explorer.state', { activeTab: value.activeTab, selectedClassId: value.selectedClassId, selectedPackageId: value.selectedPackageId });
		},
		setExplorerCopyContext: (value) => {
			void vscode.commands.executeCommand('setContext', 'vcVeTools.explorerCopyContext', value.active);
			actions.log(`Контекст Ctrl+C: active=${value.active}.`);
		},
		loadClasses: () => { void actions.sendClasses(); },
		loadPackages: () => { void actions.sendPackages(); },
		loadPackageTree: (value) => { void actions.sendPackageTree(value.packageId); },
		loadPackageFileObjects: (value) => { void actions.sendPackageFileObjects(value.fileId); },
		openPackageContent: (value) => {
			void dependencies.openPackageContent(value.fileId, value.objectId)
				.catch(error => reportError('Не удалось открыть содержимое пакета', error));
		},
		searchDatabaseObjects: (value) => { void actions.sendObjectSearch(value.query); },
		openDatabaseObject: (value) => { void actions.openDatabaseObject(value.id, value.kind, value.pinned); },
		copyEntityId: (value) => {
			actions.log(`Получена команда копирования ID=${value.id}.`);
			void vscode.env.clipboard.writeText(String(value.id));
			vscode.window.setStatusBarMessage(`ID ${value.id} скопирован`, 1500);
		},
		openClientEntity: (value) => {
			void vscode.commands.executeCommand('vc-ve-tools.openClientEntity', value.role, value.entityType, value.id);
		},
		selectExplorerEntity: (value) => {
			actions.setSelectedEntityId(value.id);
			actions.log(`Выделение изменено: ID=${value.id ?? 'нет'}.`);
		},
		openDfmEditor: (value) => {
			void dependencies.openDfmEditor(value.classId).catch(error => reportError('Не удалось открыть DFM', error));
		},
		openDfmPreview: (value) => {
			void dependencies.openDfmPreview(value.classId).catch(error => reportError('Не удалось открыть DFM', error));
		},
		openClassObjects: (value) => {
			void dependencies.openClassObjects(value.classId).catch(error => reportError('Не удалось открыть объекты класса', error));
		},
		viewObject: (value) => {
			void dependencies.viewObject(value.id).catch(error => reportError('Не удалось открыть объект', error));
		},
		viewEntityProperties: (value) => {
			void dependencies.viewEntityProperties(value.id).catch(error => reportError('Не удалось открыть свойства', error));
		},
		openClass: (value) => {
			void dependencies.openClass(value.id, value.pinned).catch(error => reportError('Не удалось открыть класс', error));
		},
	} satisfies Handlers;
	// The command and payload were validated together before reaching this dispatcher.
	return message => {
		(handlers[message.command] as (value: ExplorerWebviewMessage) => void)(message);
	};
}
