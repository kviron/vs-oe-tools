import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

export const bundledSkill = { name: 'east-express', version: 9 } as const;
export type SkillLocation = 'agents' | 'claude';
export const skillLocations: readonly SkillLocation[] = ['agents', 'claude'];

export interface InstalledSkillState {
	version: number;
	installedHash: string;
	dismissedBundledHash?: string;
}

export function bundledSkillSource(context: vscode.ExtensionContext): vscode.Uri {
	return vscode.Uri.joinPath(context.extensionUri, 'resources', 'agent-skills', bundledSkill.name, 'SKILL.md');
}

export function skillTarget(workspaceFolder: vscode.WorkspaceFolder, location: SkillLocation = 'agents'): vscode.Uri {
	return vscode.Uri.joinPath(skillTargetDirectory(workspaceFolder, location), 'SKILL.md');
}

function skillTargetDirectory(workspaceFolder: vscode.WorkspaceFolder, location: SkillLocation): vscode.Uri {
	return vscode.Uri.joinPath(workspaceFolder.uri, `.${location}`, 'skills', bundledSkill.name);
}

export function stateKey(workspaceFolder: vscode.WorkspaceFolder, location: SkillLocation = 'agents'): string {
	const suffix = contentHash(Buffer.from(workspaceFolder.uri.toString()));
	return location === 'agents' ? `agentSkill.${bundledSkill.name}.${suffix}` : `agentSkill.${bundledSkill.name}.${location}.${suffix}`;
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

export async function writeBundledSkill(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, content: Uint8Array, location: SkillLocation = 'agents'): Promise<void> {
	const target = skillTarget(workspaceFolder, location);
	await vscode.workspace.fs.createDirectory(skillTargetDirectory(workspaceFolder, location));
	await vscode.workspace.fs.writeFile(target, content);
	await saveInstalledState(context, workspaceFolder, content, location);
}

export async function saveInstalledState(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder, content: Uint8Array, location: SkillLocation = 'agents'): Promise<void> {
	await context.workspaceState.update(stateKey(workspaceFolder, location), {
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
