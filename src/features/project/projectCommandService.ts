import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';

export type ProjectDatabaseRole = 'main' | 'test';
export interface ClientCredentials { username?: string; password?: string }

export function extractBatchCommand(content: string, sourcePath: string): string {
	const line = content.split(/\r?\n/).map(value => value.trim()).find(value => /^@?call\s+/i.test(value));
	if (!line) { throw new Error(`В ${path.basename(sourcePath)} не найдена команда call.`); }
	const sourceDirectory = `${path.dirname(sourcePath)}${path.sep}`;
	return line.replace(/^@?call\s+/i, 'call ')
		.replace(/%~dp0[\\/]?/gi, sourceDirectory)
		.replace(/%~0/gi, sourcePath);
}

export function applyClientCredentials(command: string, credentials: ClientCredentials): string {
	for (const value of [credentials.username, credentials.password]) {
		if (value?.includes(',') || value?.includes('"')) { throw new Error('Логин и пароль клиента не должны содержать запятую или кавычку.'); }
	}
	let result = command;
	if (credentials.username) { result = result.replace(/username=[^,\"]*/i, `username=${credentials.username}`); }
	if (credentials.password) { result = result.replace(/password=[^,\"]*/i, `password=${credentials.password}`); }
	return result;
}

async function readProjectCommand(workspacePath: string, fileName: string, encoding: 'win1251' | 'cp866'): Promise<string> {
	const sourcePath = path.join(workspacePath, fileName);
	const content = iconv.decode(await readFile(sourcePath), encoding);
	return extractBatchCommand(content, sourcePath);
}

export async function updateProjectDatabase(role: ProjectDatabaseRole): Promise<void> {
	const workspacePath = requireWorkspacePath();
	const fileName = `DBUpdate_${role}.bat`;
	const command = await readProjectCommand(workspacePath, fileName, 'win1251');
	const answer = await vscode.window.showWarningMessage(
		`Запустить обновление ${role === 'test' ? 'тестовой' : 'основной'} базы?`,
		{ modal: true, detail: `Будет выполнена команда из ${fileName}.` },
		'Обновить',
	);
	if (answer !== 'Обновить') { return; }
	const terminal = vscode.window.createTerminal({
		name: `ВЭ: обновление базы (${role})`,
		cwd: workspacePath,
		shellPath: process.env.ComSpec ?? 'cmd.exe',
		shellArgs: ['/d'],
	});
	terminal.show();
	terminal.sendText(command, true);
}

export async function startProjectClient(role: ProjectDatabaseRole, credentials: ClientCredentials = {}): Promise<void> {
	const workspacePath = requireWorkspacePath();
	const fileName = role === 'test' ? 'start_test.bat' : 'start.bat';
	const command = applyClientCredentials(await readProjectCommand(workspacePath, fileName, 'cp866'), credentials);
	const terminal = vscode.window.createTerminal({
		name: `ВЭ: запуск клиента (${role})`,
		cwd: workspacePath,
		shellPath: process.env.ComSpec ?? 'cmd.exe',
		shellArgs: ['/d'],
	});
	terminal.show();
	terminal.sendText(command, true);
	void vscode.window.showInformationMessage(`Команда запуска клиента ВЭ отправлена: ${role === 'test' ? 'тестовая' : 'основная'} база.`);
}

function requireWorkspacePath(): string {
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
	return workspacePath;
}
