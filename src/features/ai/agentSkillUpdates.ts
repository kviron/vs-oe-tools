import * as vscode from 'vscode';
import {
	buffersEqual, bundledSkill, bundledSkillSource, contentHash, openSkillDiff,
	readFileIfExists, saveInstalledState, skillTarget, stateKey, writeBundledSkill,
	type InstalledSkillState,
} from './agentSkillFiles';

export async function updateManagedSkills(context: vscode.ExtensionContext): Promise<void> {
	for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
		const state = context.workspaceState.get<InstalledSkillState>(stateKey(workspaceFolder));
		if (!state) {
			continue;
		}

		const source = bundledSkillSource(context);
		const target = skillTarget(workspaceFolder);
		const [bundledContent, installedContent] = await Promise.all([
			vscode.workspace.fs.readFile(source),
			readFileIfExists(target),
		]);
		if (!installedContent) {
			await context.workspaceState.update(stateKey(workspaceFolder), undefined);
			continue;
		}

		const bundledHash = contentHash(bundledContent);
		if (buffersEqual(installedContent, bundledContent)) {
			if (state.installedHash !== bundledHash || state.version !== bundledSkill.version) {
				await saveInstalledState(context, workspaceFolder, bundledContent);
			}
			continue;
		}
		if (state.dismissedBundledHash === bundledHash) {
			continue;
		}

		if (contentHash(installedContent) === state.installedHash) {
			await writeBundledSkill(context, workspaceFolder, bundledContent);
			void vscode.window.showInformationMessage(
				`Навык Восточного Экспресса автоматически обновлён до версии ${bundledSkill.version}.`,
			);
			continue;
		}

		const choice = await vscode.window.showWarningMessage(
			`Доступно обновление навыка Восточного Экспресса до версии ${bundledSkill.version}, но установленный файл изменён.`,
			'Обновить',
			'Сравнить',
			'Оставить свой',
		);
		if (choice === 'Обновить') {
			await writeBundledSkill(context, workspaceFolder, bundledContent);
		} else if (choice === 'Сравнить') {
			await openSkillDiff(source, target);
		} else if (choice === 'Оставить свой') {
			await context.workspaceState.update(stateKey(workspaceFolder), {
				...state,
				dismissedBundledHash: bundledHash,
			} satisfies InstalledSkillState);
		}
	}
}
