import * as vscode from 'vscode';
import type { ExplorerViewProvider } from './explorerViewProvider';

export function registerExplorerCommands(context: vscode.ExtensionContext, explorer: ExplorerViewProvider): void {
	context.subscriptions.push(vscode.commands.registerCommand(
		'vc-ve-tools.copySelectedExplorerId', () => explorer.copySelectedEntityId(),
	));
}
