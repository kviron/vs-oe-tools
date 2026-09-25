import * as vscode from 'vscode';
import { NativeLogEditorProvider } from './nativeLogEditorProvider';
import { NativeLogsViewProvider } from './nativeLogsViewProvider';

export function registerNativeLogs(context: vscode.ExtensionContext): void {
	const editor = new NativeLogEditorProvider();
	const provider = new NativeLogsViewProvider(context.extensionUri, fileName => editor.open(fileName));
	context.subscriptions.push(
		...editor.registrations(),
		vscode.window.registerWebviewViewProvider(
			NativeLogsViewProvider.viewType, provider,
			{ webviewOptions: { retainContextWhenHidden: true } },
		),
	);
}
