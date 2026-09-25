import * as vscode from 'vscode';
import { loadClasses } from '../../infrastructure/database/classRepository';
import { searchDatabaseObjects } from '../../infrastructure/database/objectSearchRepository';
import { loadPackageFileContent, loadPackages, loadPackageTree, searchPackages } from '../../infrastructure/database/packageExplorerRepository';
import { openClassDetails, revealClassMethod } from '../classes/views/classDetailsPanelManager';
import { openAttributeDetails } from '../classes/views/attributeDetailsPanelManager';
import { openClassObjects } from '../classes/views/classObjectsPanelManager';
import { openEntityProperties } from '../classes/views/entityPropertiesPanelManager';
import { openObjectView } from '../classes/views/objectViewPanelManager';
import { openDfmPreview } from '../dfm/dfmPreview';
import { openPackageContent } from '../packages/packageContentPanelManager';
import type { ProductionTaskSummary } from '../production-tasks';
import type { DfmEditorProvider } from '../dfm/dfmEditorProvider';
import type { MethodEditorProvider } from '../methods/methodEditorProvider';
import type { ModuleEditorProvider } from '../modules/moduleEditorProvider';
import { registerClipboardObjectNavigation } from './clipboardObjectNavigation';
import { ExplorerViewProvider } from './explorerViewProvider';

interface Editors {
	methodEditor: MethodEditorProvider;
	moduleEditor: ModuleEditorProvider;
	dfmEditor: DfmEditorProvider;
}

interface TaskNavigation {
	searchTasks(query: string, limit: number): Promise<ProductionTaskSummary[]>;
	showTask(task: ProductionTaskSummary): void;
}

export function registerExplorer(context: vscode.ExtensionContext, editors: Editors): ExplorerViewProvider {
	const { methodEditor, moduleEditor, dfmEditor } = editors;
	const provider = new ExplorerViewProvider(
		context.workspaceState,
		context.extensionUri,
		loadClasses,
		(id, pinned) => openClassDetails(context, methodEditor, id, pinned),
		id => dfmEditor.open(id),
		id => openDfmPreview(context, id),
		searchDatabaseObjects,
		id => methodEditor.open(id),
		id => moduleEditor.open(id),
		id => openAttributeDetails(context, id),
		id => openClassObjects(context, id),
		id => openObjectView(context, id),
		id => openEntityProperties(context, id),
		loadPackages,
		loadPackageTree,
		loadPackageFileContent,
		(fileId, objectId) => openPackageContent(context, fileId, objectId, async (id, kind) => {
			if (kind === 'class') { await openClassDetails(context, methodEditor, id, true); }
			else if (kind === 'method') { await methodEditor.open(id); }
			else if (kind === 'module') { await moduleEditor.open(id); }
			else if (kind === 'attribute') { await openAttributeDetails(context, id); }
			else { await openObjectView(context, id); }
		}),
	);
	context.subscriptions.push(
		provider,
		vscode.window.registerWebviewViewProvider('vc-ve-tools.explorer', provider),
	);
	return provider;
}

export function registerExplorerClipboard(
	context: vscode.ExtensionContext,
	explorer: ExplorerViewProvider,
	editors: Pick<Editors, 'methodEditor' | 'moduleEditor'>,
	productionTasks: TaskNavigation,
): void {
	const { methodEditor, moduleEditor } = editors;
	context.subscriptions.push(registerClipboardObjectNavigation({
		findById: async id => (await searchDatabaseObjects(String(id), 1))[0],
		findTaskByReference: async reference => (await productionTasks.searchTasks(String(reference), 1))[0],
		searchObjects: query => searchDatabaseObjects(query, 50),
		searchTasks: query => productionTasks.searchTasks(query, 10),
		searchPackages: query => searchPackages(query, 25),
		revealClass: id => explorer.revealClass(id),
		openClass: id => openClassDetails(context, methodEditor, id, true),
		openClassObjects: id => openClassObjects(context, id),
		revealMethod: (classId, methodId) => revealClassMethod(context, methodEditor, classId, methodId),
		openAttribute: async (classId, attributeId) => {
			await explorer.revealClass(classId);
			await openAttributeDetails(context, attributeId);
		},
		openDictionary: (classId, objectId) => openClassObjects(context, classId, objectId),
		openMethod: id => methodEditor.open(id),
		openModule: id => moduleEditor.open(id),
		openObject: id => openObjectView(context, id),
		openHistory: async object => vscode.commands.executeCommand(
			object.kind === 'method' || object.kind === 'module' ? 'vc-ve-tools.svnHistory' : 'vc-ve-tools.svnObjectHistory',
			Number(object.id),
		),
		openTask: async task => productionTasks.showTask(task),
		revealPackage: id => explorer.revealPackage(id),
	}, context.workspaceState));
}
