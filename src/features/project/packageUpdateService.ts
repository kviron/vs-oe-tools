import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

export async function updateProjectPackages(): Promise<boolean> {
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
	const packagesPath = path.join(workspacePath, 'packages');
	const packagesStat = await stat(packagesPath).catch(() => undefined);
	if (!packagesStat?.isDirectory()) { throw new Error(`Не найдена папка ${packagesPath}.`); }
	const answer = await vscode.window.showWarningMessage(
		'Обновить пакеты проекта из SVN?',
		{ modal: true, detail: `В папке ${packagesPath} будет выполнена команда svn update.` },
		'Обновить',
	);
	if (answer !== 'Обновить') { return false; }
	const terminal = vscode.window.createTerminal({
		name: 'ВЭ: обновление пакетов',
		cwd: packagesPath,
		shellPath: process.env.ComSpec ?? 'cmd.exe',
		shellArgs: ['/d'],
	});
	terminal.show();
	terminal.sendText('svn update', true);
	return true;
}
