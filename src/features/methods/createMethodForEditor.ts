import * as vscode from 'vscode';
import type { ClassMethodDraft } from '../classes/models';
import { getProjectDatabaseOptions, getProjectDatabaseOptionsForDatabase } from '../../infrastructure/configuration/projectDatabaseOptions';
import { createClassMethod } from '../../infrastructure/database/methodRepository';

/** Resolves the requested database and persists a new method for the editor. */
export async function createMethodForEditor(
	draft: ClassMethodDraft,
	target?: { database: string; host: string },
) {
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
}
