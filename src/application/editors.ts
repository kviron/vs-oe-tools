import * as vscode from 'vscode';
import { getProjectDatabaseOptions, getProjectDatabaseOptionsForDatabase } from '../infrastructure/configuration/projectDatabaseOptions';
import { createClassMethod } from '../infrastructure/database/methodRepository';
import { registerMethodEditor, MethodCompilationHistory, MethodCompilationService } from '../features/methods';
import { registerModuleEditor } from '../features/modules';
import { registerDfmEditor, registerDfmLanguageFeatures } from '../features/dfm';
import type { bootstrap } from './bootstrap';

export function registerEditors(context: vscode.ExtensionContext, app: Awaited<ReturnType<typeof bootstrap>>) {
	const compilationHistory = new MethodCompilationHistory(vscode.Uri.joinPath(context.globalStorageUri, 'method-compilations.jsonl').fsPath);
	const methodCompilation = new MethodCompilationService(app.workspacePath, app.credentials.get, compilationHistory);
	const methodEditor = registerMethodEditor(context, async (draft, target) => {
		let databaseOptions;
		if (target) {
			const currentWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!currentWorkspacePath) { throw new Error('Открытая папка проекта не найдена.'); }
			databaseOptions = await getProjectDatabaseOptionsForDatabase(currentWorkspacePath, target.database, target.host);
		} else {
			databaseOptions = await getProjectDatabaseOptions();
		}
		const created = await createClassMethod(draft, databaseOptions);
		return { ...created, databaseOptions };
	}, methodCompilation);
	const moduleEditor = registerModuleEditor(context);
	const dfmEditor = registerDfmEditor(context);
	registerDfmLanguageFeatures(context, dfmEditor);
	return { methodEditor, moduleEditor, dfmEditor, compilationHistory, methodCompilation };
}
