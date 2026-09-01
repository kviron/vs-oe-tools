import type * as vscode from 'vscode';
import { activate as registerExtensionFeatures } from './activate';

/** Composition root: creates and wires all extension features. */
export async function activateExtension(context: vscode.ExtensionContext): Promise<void> {
	await registerExtensionFeatures(context);
}

