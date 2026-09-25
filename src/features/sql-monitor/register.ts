import * as vscode from 'vscode';
import { openSqlMonitor } from './views/sqlMonitorPanelManager';

export function registerSqlMonitorCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand(
		'vc-ve-tools.openSqlMonitor', () => openSqlMonitor(context),
	));
}
