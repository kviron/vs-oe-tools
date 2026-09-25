import * as vscode from 'vscode';
import {
	buffersEqual, bundledSkillSource, openSkillDiff, readFileIfExists,
	saveInstalledState, skillTarget, writeBundledSkill,
} from './agentSkillFiles';
import { updateManagedSkills } from './agentSkillUpdates';

export function registerAgentSkillInstaller(context: vscode.ExtensionContext): vscode.Disposable {
	const command = vscode.commands.registerCommand('vc-ve-tools.installAgentSkills', async () => {
		try {
			const workspaceFolder = await selectWorkspaceFolder();
			if (workspaceFolder) {
				await installBundledSkill(context, workspaceFolder);
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось установить навык Восточного Экспресса: ${errorMessage(error)}`);
		}
	});

	void updateManagedSkills(context).catch((error) => {
		console.error('Не удалось проверить обновления навыков Восточного Экспресса:', error);
	});

	return command;
}

async function installBundledSkill(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const source = bundledSkillSource(context);
	const target = skillTarget(workspaceFolder);
	const bundledContent = await vscode.workspace.fs.readFile(source);
	const existingContent = await readFileIfExists(target);

	if (existingContent && buffersEqual(existingContent, bundledContent)) {
		await saveInstalledState(context, workspaceFolder, bundledContent);
		void vscode.window.showInformationMessage('Навык Восточного Экспресса уже установлен и актуален.');
		return;
	}

	if (existingContent) {
		const choice = await vscode.window.showWarningMessage(
			'Навык Восточного Экспресса уже существует в проекте. Обновить его встроенной версией?',
			{ modal: true },
			'Обновить',
			'Сравнить',
		);
		if (choice === 'Сравнить') {
			await openSkillDiff(source, target);
			return;
		}
		if (choice !== 'Обновить') {
			return;
		}
	}

	await writeBundledSkill(context, workspaceFolder, bundledContent);
	void vscode.window.showInformationMessage(
		`Навык Восточного Экспресса установлен в ${vscode.workspace.asRelativePath(target, false)}.`,
	);
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
	return vscode.window.showWorkspaceFolderPick({ placeHolder: 'Выберите проект для установки навыка Восточного Экспресса' });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
