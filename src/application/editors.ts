import * as vscode from 'vscode';
import { createMethodForEditor, registerMethodEditor, MethodCompilationHistory, MethodCompilationService } from '../features/methods';
import { registerModuleEditor } from '../features/modules';
import { registerDfmEditor, registerDfmLanguageFeatures } from '../features/dfm';
import type { bootstrap } from './bootstrap';

export function registerEditors(context: vscode.ExtensionContext, app: Awaited<ReturnType<typeof bootstrap>>) {
	const compilationHistory = new MethodCompilationHistory(vscode.Uri.joinPath(context.globalStorageUri, 'method-compilations.jsonl').fsPath);
	const methodCompilation = new MethodCompilationService(app.workspacePath, app.credentials.get, compilationHistory);
	const methodEditor = registerMethodEditor(context, createMethodForEditor, methodCompilation);
	const moduleEditor = registerModuleEditor(context);
	const dfmEditor = registerDfmEditor(context);
	registerDfmLanguageFeatures(context, dfmEditor);
	return { methodEditor, moduleEditor, dfmEditor, compilationHistory, methodCompilation };
}
