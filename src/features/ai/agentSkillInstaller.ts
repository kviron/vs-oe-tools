import * as vscode from 'vscode';
import {
	buffersEqual, bundledSkillSource, openSkillDiff, readFileIfExists,
	saveInstalledState, skillLocations, skillTarget, writeBundledSkill,
} from './agentSkillFiles';
import { ensureBundledSkills, updateManagedSkills } from './agentSkillUpdates';

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

	let synchronization = Promise.resolve();
	const synchronize = () => {
		synchronization = synchronization.then(async () => {
			await updateManagedSkills(context);
			await ensureBundledSkills(context);
		}).catch((error) => {
			console.error('Не удалось подключить навык Восточного Экспресса:', error);
		});
	};
	synchronize();
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(synchronize);

	return vscode.Disposable.from(command, workspaceListener);
}

async function installBundledSkill(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const source = bundledSkillSource(context);
	const bundledContent = await vscode.workspace.fs.readFile(source);
	let installed = 0;
	let current = 0;
	for (const location of skillLocations) {
		const target = skillTarget(workspaceFolder, location);
		const existingContent = await readFileIfExists(target);

		if (existingContent && buffersEqual(existingContent, bundledContent)) {
			await saveInstalledState(context, workspaceFolder, bundledContent, location);
			current += 1;
			continue;
		}

		if (existingContent) {
			const choice = await vscode.window.showWarningMessage(
				`Навык Восточного Экспресса уже существует в ${vscode.workspace.asRelativePath(target, false)}. Обновить его встроенной версией?`,
				{ modal: true },
				'Обновить',
				'Сравнить',
			);
			if (choice === 'Сравнить') {
				await openSkillDiff(source, target);
				continue;
			}
			if (choice !== 'Обновить') { continue; }
		}
		await writeBundledSkill(context, workspaceFolder, bundledContent, location);
		installed += 1;
	}
	if (installed === skillLocations.length || installed + current === skillLocations.length) {
		void vscode.window.showInformationMessage('Навык Восточного Экспресса доступен для Codex, Cursor и Claude Code в папке проекта.');
	} else if (installed > 0) {
		void vscode.window.showInformationMessage(`Навык Восточного Экспресса установлен в ${installed} из ${skillLocations.length} каталогов агентов.`);
	}
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
