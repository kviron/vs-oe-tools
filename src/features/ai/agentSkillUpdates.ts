import * as vscode from 'vscode';
import {
	buffersEqual, bundledSkill, bundledSkillSource, contentHash, openSkillDiff,
	readFileIfExists, saveInstalledState, skillLocations, skillTarget, stateKey, writeBundledSkill,
	type InstalledSkillState,
} from './agentSkillFiles';

export async function updateManagedSkills(context: vscode.ExtensionContext): Promise<void> {
	for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
		for (const location of skillLocations) {
			const state = context.workspaceState.get<InstalledSkillState>(stateKey(workspaceFolder, location));
			if (!state) {
				continue;
			}

			const source = bundledSkillSource(context);
			const target = skillTarget(workspaceFolder, location);
			const [bundledContent, installedContent] = await Promise.all([
				vscode.workspace.fs.readFile(source),
				readFileIfExists(target),
			]);
			if (!installedContent) {
				await context.workspaceState.update(stateKey(workspaceFolder, location), undefined);
				continue;
			}

			const bundledHash = contentHash(bundledContent);
			if (buffersEqual(installedContent, bundledContent)) {
				if (state.installedHash !== bundledHash || state.version !== bundledSkill.version) {
					await saveInstalledState(context, workspaceFolder, bundledContent, location);
				}
				continue;
			}
			if (state.dismissedBundledHash === bundledHash) {
				continue;
			}

			if (contentHash(installedContent) === state.installedHash) {
				await writeBundledSkill(context, workspaceFolder, bundledContent, location);
				void vscode.window.showInformationMessage(
					`Навык Восточного Экспресса автоматически обновлён до версии ${bundledSkill.version}.`,
				);
				continue;
			}

			const choice = await vscode.window.showWarningMessage(
				`Доступно обновление навыка Восточного Экспресса до версии ${bundledSkill.version}, но установленный файл изменён: ${vscode.workspace.asRelativePath(target, false)}.`,
				'Обновить',
				'Сравнить',
				'Оставить свой',
			);
			if (choice === 'Обновить') {
				await writeBundledSkill(context, workspaceFolder, bundledContent, location);
			} else if (choice === 'Сравнить') {
				await openSkillDiff(source, target);
			} else if (choice === 'Оставить свой') {
				await context.workspaceState.update(stateKey(workspaceFolder, location), {
					...state,
					dismissedBundledHash: bundledHash,
				} satisfies InstalledSkillState);
			}
		}
	}
}

/** Install the bundled skill for new workspace folders without replacing user-owned files. */
export async function ensureBundledSkills(
	context: vscode.ExtensionContext,
	workspaceFolders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? [],
): Promise<void> {
	const source = bundledSkillSource(context);
	const content = await vscode.workspace.fs.readFile(source);
	for (const workspaceFolder of workspaceFolders) {
		for (const location of skillLocations) {
			const target = skillTarget(workspaceFolder, location);
			const existing = await readFileIfExists(target);
			if (!existing) {
				await writeBundledSkill(context, workspaceFolder, content, location);
			} else if (buffersEqual(existing, content)) {
				await saveInstalledState(context, workspaceFolder, content, location);
			}
		}
	}
}
