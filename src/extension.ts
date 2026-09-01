import type * as vscode from 'vscode';
import { activateExtension } from './application/extensionApplication';

export function activate(context: vscode.ExtensionContext): Promise<void> {
	return activateExtension(context);
}

export function deactivate(): void {}
