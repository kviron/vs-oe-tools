import * as vscode from 'vscode';
import { SqlExecutorViewProvider } from './sqlExecutorViewProvider';

export function registerSqlExecutor(context: vscode.ExtensionContext): void {
	const provider = new SqlExecutorViewProvider(context.extensionUri);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(
		SqlExecutorViewProvider.viewType, provider,
		{ webviewOptions: { retainContextWhenHidden: true } },
	));
}
