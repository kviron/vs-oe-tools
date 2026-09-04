import * as vscode from 'vscode';

const skillName = 'east-express';

export function registerAgentSkillInstaller(context: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand('vc-ve-tools.installAgentSkills', async () => {
		const workspaceFolder = await selectWorkspaceFolder();
		if (!workspaceFolder) {
			return;
		}

		const source = vscode.Uri.joinPath(context.extensionUri, 'resources', 'agent-skills', skillName, 'SKILL.md');
		const targetDirectory = vscode.Uri.joinPath(workspaceFolder.uri, '.agents', 'skills', skillName);
		const target = vscode.Uri.joinPath(targetDirectory, 'SKILL.md');
		const bundledContent = await vscode.workspace.fs.readFile(source);
		const existingContent = await readFileIfExists(target);

		if (existingContent && buffersEqual(existingContent, bundledContent)) {
			void vscode.window.showInformationMessage('Навык Восточного Экспресса уже установлен и актуален.');
			return;
		}

		if (existingContent) {
			const choice = await vscode.window.showWarningMessage(
				'Навык Восточного Экспресса уже существует в проекте. Обновить его встроенной версией?',
				{ modal: true },
				'Обновить',
			);
			if (choice !== 'Обновить') {
				return;
			}
		}

		await vscode.workspace.fs.createDirectory(targetDirectory);
		await vscode.workspace.fs.writeFile(target, bundledContent);
		void vscode.window.showInformationMessage(
			`Навык Восточного Экспресса установлен в ${vscode.workspace.asRelativePath(target, false)}.`,
		);
	});
}

async function selectWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders?.length) {
		void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
		return undefined;
	}
	if (folders.length === 1) {
		return folders[0];
	}

	return vscode.window.showWorkspaceFolderPick({
		placeHolder: 'Выберите проект для установки навыка Восточного Экспресса',
	});
}

async function readFileIfExists(uri: vscode.Uri): Promise<Uint8Array | undefined> {
	try {
		return await vscode.workspace.fs.readFile(uri);
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return undefined;
		}
		throw error;
	}
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}
