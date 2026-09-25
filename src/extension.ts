import type * as vscode from 'vscode';
import { activate as activateApplication } from './application/activate';

export function activate(context: vscode.ExtensionContext): Promise<void> {
	return activateApplication(context);
}

export function deactivate(): void {}
