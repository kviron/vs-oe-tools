import * as path from 'node:path';
import * as vscode from 'vscode';
import { clientLaunchArgumentsSetting } from '../../core/constants';
import type { DatabaseRole } from '../../core/database';
import { isClientObjectUri } from './clientDeepLink';
import { requireClientExecutable, resolveClientTarget } from './clientTarget';

export type ProjectDatabaseRole = DatabaseRole;
export interface ClientCredentials { username?: string; password?: string }

export function parseClientLaunchArguments(value: string): string[] {
	if (value.length > 2000) { throw new Error('Дополнительные параметры запуска не должны превышать 2000 символов.'); }
	if (/[&|<>^%!\r\n]/u.test(value)) {
		throw new Error('Дополнительные параметры содержат недопустимые для командной строки символы.');
	}
	const result: string[] = [];
	let token = '';
	let quoted = false;
	let tokenStarted = false;
	for (const character of value.trim()) {
		if (character === '"') {
			quoted = !quoted;
			tokenStarted = true;
		} else if (/\s/u.test(character) && !quoted) {
			if (tokenStarted) {
				result.push(token);
				token = '';
				tokenStarted = false;
			}
		} else {
			token += character;
			tokenStarted = true;
		}
	}
	if (quoted) { throw new Error('В дополнительных параметрах не закрыта двойная кавычка.'); }
	if (tokenStarted) { result.push(token); }
	const reserved = result.find(argument => /^(?:-noselfupdate|-ok|-l(?:=|$))/iu.test(argument));
	if (reserved) { throw new Error(`Параметр ${reserved} задаётся расширением автоматически.`); }
	return result;
}

export function createClientLaunchCommand(
	workspacePath: string,
	role: ProjectDatabaseRole,
	target: { host: string; database: string },
	credentials: ClientCredentials,
	openUri?: string,
	extraArguments = '',
): string {
	const username = credentials.username?.trim();
	const password = credentials.password;
	if (!username || !password) { throw new Error('Укажите логин и пароль клиента ВЭ в настройках расширения.'); }
	for (const [label, value] of [['Логин', username], ['Пароль', password], ['Host', target.host], ['База', target.database]] as const) {
		if (!value.trim() || /[,"\r\n]/.test(value)) { throw new Error(`${label} содержит недопустимые символы.`); }
	}
	if (openUri && !isClientObjectUri(openUri, target.database)) {
		throw new Error(`Некорректная ссылка открытия объекта ВЭ: ${openUri}`);
	}
	if (/["\r\n]/.test(workspacePath)) { throw new Error('Путь проекта содержит недопустимые символы.'); }

	const binPath = path.join(workspacePath, 'bin');
	const executablePath = path.join(binPath, 'fme.exe');
	const login = [
		`host=${target.host.trim()}`,
		`db=${target.database.trim()}`,
		`username=${username}`,
		`password=${password}`,
		...(role === 'main' ? ['MultiLogin=True'] : []),
	].join(',');
	const openArgument = openUri ? ` "${openUri}"` : '';
	const extraArgumentList = parseClientLaunchArguments(extraArguments)
		.map(argument => ` "${argument}"`)
		.join('');
	return `start "" /D "${binPath}" "${executablePath}" -NoSelfUpdate${extraArgumentList}${openArgument} -l "${login}" -ok`;
}

export async function startProjectClient(role: ProjectDatabaseRole, credentials: ClientCredentials = {}): Promise<void> {
	const { workspacePath, database, host } = await resolveClientTarget(role);
	await requireClientExecutable(workspacePath);
	const extraArguments = vscode.workspace.getConfiguration('vcVeTools').get<string>(clientLaunchArgumentsSetting, '');
	const command = createClientLaunchCommand(workspacePath, role, { host, database }, credentials, undefined, extraArguments);
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
