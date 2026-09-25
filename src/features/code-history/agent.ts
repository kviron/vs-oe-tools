import * as path from 'node:path';
import * as vscode from 'vscode';
import { svnLog } from './svnClient';

export function createCodeHistoryAgentActions() {
	return {
		getSvnFileHistory: async (filePath: string, limit: number) => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) { throw new Error('Открытая папка проекта не найдена.'); }
			const workspaceRoot = path.resolve(workspaceFolder.uri.fsPath);
			const resolvedPath = path.resolve(workspaceRoot, filePath);
			const relativePath = path.relative(workspaceRoot, resolvedPath);
			if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
				throw new Error('SVN-историю можно читать только для файлов открытого проекта.');
			}
			const entries = await svnLog(resolvedPath, limit);
			return {
				filePath: resolvedPath,
				count: entries.length,
				entries: entries.map(entry => ({ revision: entry.revision, author: entry.author, date: entry.date.toISOString(), message: entry.message })),
			};
		},
	};
}
