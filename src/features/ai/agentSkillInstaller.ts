import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

const bundledSkill = { name: 'east-express', version: 2 } as const;

interface InstalledSkillState {
	version: number;
	installedHash: string;
	dismissedBundledHash?: string;
}

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
	const targetDirectory = skillTargetDirectory(workspaceFolder);
	const target = vscode.Uri.joinPath(targetDirectory, 'SKILL.md');
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

async function updateManagedSkills(context: vscode.ExtensionContext): Promise<void> {
	for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
		const state = context.workspaceState.get<InstalledSkillState>(stateKey(workspaceFolder));
		if (!state) {
			continue;
		}

		const source = bundledSkillSource(context);
		const target = vscode.Uri.joinPath(skillTargetDirectory(workspaceFolder), 'SKILL.md');
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

async function writeBundledSkill(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, bundledContent: Uint8Array): Promise<void> {
	const targetDirectory = skillTargetDirectory(workspaceFolder);
	await vscode.workspace.fs.createDirectory(targetDirectory);
	await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(targetDirectory, 'SKILL.md'), bundledContent);
	await saveInstalledState(context, workspaceFolder, bundledContent);
}

async function saveInstalledState(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, content: Uint8Array): Promise<void> {
	await context.workspaceState.update(stateKey(workspaceFolder), {
		version: bundledSkill.version,
		installedHash: contentHash(content),
	} satisfies InstalledSkillState);
}

function bundledSkillSource(context: vscode.ExtensionContext): vscode.Uri {
	return vscode.Uri.joinPath(context.extensionUri, 'resources', 'agent-skills', bundledSkill.name, 'SKILL.md');
}

function skillTargetDirectory(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
	return vscode.Uri.joinPath(workspaceFolder.uri, '.agents', 'skills', bundledSkill.name);
}

function stateKey(workspaceFolder: vscode.WorkspaceFolder): string {
	return `agentSkill.${bundledSkill.name}.${contentHash(Buffer.from(workspaceFolder.uri.toString()))}`;
}

async function openSkillDiff(source: vscode.Uri, target: vscode.Uri): Promise<void> {
	await vscode.commands.executeCommand('vscode.diff', target, source, 'Навык Восточного Экспресса: установленный ↔ встроенный');
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

function contentHash(content: Uint8Array): string {
	return createHash('sha256').update(content).digest('hex');
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
