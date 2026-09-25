import type * as vscode from 'vscode';
import { bootstrap } from '#app/application/bootstrap';
import { registerEditors } from '#app/application/editors';
import { registerFeatures } from '#app/application/features';
import { registerNavigation } from '#app/application/navigation';
import { registerMcp } from '#app/application/mcp';
import { registerWorkbench } from '#app/application/workbench';
import { registerWorkspace } from '#app/application/workspace';

/** Starts application stages in dependency order. Feature setup lives in each stage. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const app = await bootstrap(context);
	const editors = registerEditors(context, app);
	const features = registerFeatures(context, app, editors);
	const navigation = await registerNavigation(context, app, editors, features);
	const mcp = await registerMcp(context, app, navigation);
	const workbench = registerWorkbench(context, editors, features);
	await registerWorkspace(context, app, features, mcp, workbench);
}
