import * as vscode from 'vscode';
import { registerClasses } from '../features/classes';
import { registerExplorer, registerExplorerClipboard } from '../features/explorer';
import { registerCodeHistory } from '../features/code-history';
import { registerProject } from '../features/project';
import { registerProductionTasks } from '../features/production-tasks';
import type { bootstrap } from './bootstrap';
import type { registerEditors } from './editors';

export function registerFeatures(
	context: vscode.ExtensionContext,
	app: Awaited<ReturnType<typeof bootstrap>>,
	editors: ReturnType<typeof registerEditors>,
) {
	const { methodEditor, moduleEditor, dfmEditor } = editors;
	const project = registerProject({ context, logger: app.logger, credentials: app.credentials });
	registerClasses(context, {
		getClientCredentials: app.credentials.get,
		openMethod: id => methodEditor.open(id),
		openModule: id => moduleEditor.open(id),
	});
	const explorerProvider = registerExplorer(context, { methodEditor, moduleEditor, dfmEditor });
	const productionTasks = registerProductionTasks(context, app.workspacePath, app.credentials.get, app.logger);
	registerCodeHistory(context, methodEditor, moduleEditor, productionTasks.openReference);
	registerExplorerClipboard(context, explorerProvider, { methodEditor, moduleEditor }, productionTasks);
	return { project, explorerProvider, productionTasks };
}
