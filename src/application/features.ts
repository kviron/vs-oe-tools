import * as vscode from 'vscode';
import { registerClasses } from '../features/classes';
import { registerExplorer, registerExplorerClipboard } from '../features/explorer';
import { registerCodeHistory } from '../features/code-history';
import { registerSettings } from '../features/settings';
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
	const project = registerProject({ context, credentials: app.credentials });
	const settingsProvider = registerSettings({ context, logger: app.logger, project: project.actions, credentials: app.credentials });
	registerClasses(context, {
		getClientCredentials: app.credentials.get,
		openMethod: id => methodEditor.open(id),
		openModule: id => moduleEditor.open(id),
	});
	const explorerProvider = registerExplorer(context, { methodEditor, moduleEditor, dfmEditor });
	const productionTasks = registerProductionTasks(context, app.workspacePath, app.credentials.get, app.logger);
	registerCodeHistory(context, methodEditor, moduleEditor, productionTasks.openReference);
	registerExplorerClipboard(context, explorerProvider, { methodEditor, moduleEditor }, productionTasks);
	return { project, settingsProvider, explorerProvider, productionTasks };
}
