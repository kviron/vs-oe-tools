import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

export const bundledSkill = { name: 'east-express', version: 3 } as const;

export interface InstalledSkillState {
	version: number;
	installedHash: string;
	dismissedBundledHash?: string;
}

export function bundledSkillSource(context: vscode.ExtensionContext): vscode.Uri {
	return vscode.Uri.joinPath(context.extensionUri, 'resources', 'agent-skills', bundledSkill.name, 'SKILL.md');
}

export function skillTarget(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
	return vscode.Uri.joinPath(skillTargetDirectory(workspaceFolder), 'SKILL.md');
}

function skillTargetDirectory(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
	return vscode.Uri.joinPath(workspaceFolder.uri, '.agents', 'skills', bundledSkill.name);
}

export function stateKey(workspaceFolder: vscode.WorkspaceFolder): string {
	return `agentSkill.${bundledSkill.name}.${contentHash(Buffer.from(workspaceFolder.uri.toString()))}`;
}

export async function readFileIfExists(uri: vscode.Uri): Promise<Uint8Array | undefined> {
	try {
		return await vscode.workspace.fs.readFile(uri);
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return undefined;
		}
		throw error;
	}
}

export async function writeBundledSkill(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, content: Uint8Array): Promise<void> {
	const target = skillTarget(workspaceFolder);
	await vscode.workspace.fs.createDirectory(skillTargetDirectory(workspaceFolder));
	await vscode.workspace.fs.writeFile(target, content);
	await saveInstalledState(context, workspaceFolder, content);
}

export async function saveInstalledState(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, content: Uint8Array): Promise<void> {
	await context.workspaceState.update(stateKey(workspaceFolder), {
		version: bundledSkill.version,
		installedHash: contentHash(content),
	} satisfies InstalledSkillState);
}

export function contentHash(content: Uint8Array): string {
	return createHash('sha256').update(content).digest('hex');
}

export function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

export async function openSkillDiff(source: vscode.Uri, target: vscode.Uri): Promise<void> {
	await vscode.commands.executeCommand('vscode.diff', target, source, 'Навык Восточного Экспресса: установленный ↔ встроенный');
}
