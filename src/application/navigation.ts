import * as vscode from 'vscode';
import { registerNavigationTools, createNavigationActions, startNavigationBridge, registerAgentSkillInstaller } from '../features/ai';
import { getNavigationInfoPath } from '../core/navigationInfo';
import type { bootstrap } from './bootstrap';
import type { registerEditors } from './editors';
import type { registerFeatures } from './features';

export async function registerNavigation(
	context: vscode.ExtensionContext,
	app: Awaited<ReturnType<typeof bootstrap>>,
	editors: ReturnType<typeof registerEditors>,
	features: ReturnType<typeof registerFeatures>,
) {
	const navigationActions = createNavigationActions({
		context, workspacePath: app.workspacePath, getClientCredentials: app.credentials.get,
		extensionLogger: app.logger, explorerProvider: features.explorerProvider,
		methodEditor: editors.methodEditor, methodCompilation: editors.methodCompilation,
		compilationHistory: editors.compilationHistory, moduleEditor: editors.moduleEditor,
		settingsProvider: features.project.settingsProvider, productionTasks: features.productionTasks,
	});
	registerNavigationTools(context, navigationActions);
	const bridge = await startNavigationBridge(
		navigationActions,
		vscode.workspace.workspaceFolders?.[0]
			? getNavigationInfoPath(vscode.workspace.workspaceFolders[0].uri.fsPath)
			: vscode.Uri.joinPath(context.globalStorageUri, 'navigation-bridge.json').fsPath,
	);
	context.subscriptions.push(bridge);
	context.subscriptions.push(registerAgentSkillInstaller(context));
	return { bridge };
}
