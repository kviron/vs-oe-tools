import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import { clientLaunchArgumentsSetting } from '../../core/constants';
import { parseVarsFile } from '../../infrastructure/configuration/projectDatabaseOptions';

export type ProjectDatabaseRole = 'main' | 'test';
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
	if (openUri && (!/^oe-[a-z0-9_-]+:\/open\/[^/]+\/[1-9]\d*$/iu.test(openUri) || /["\r\n]/.test(openUri))) {
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

export async function updateProjectPackages(): Promise<boolean> {
	const workspacePath = requireWorkspacePath();
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

export async function startProjectClient(role: ProjectDatabaseRole, credentials: ClientCredentials = {}, openUri?: string): Promise<void> {
	const workspacePath = requireWorkspacePath();
	const varsPath = path.join(workspacePath, 'Vars.bat');
	const variables = parseVarsFile(iconv.decode(await readFile(varsPath), 'win1251'));
	const database = variables.get(`devdbname_${role}`);
	if (!database) { throw new Error(`В Vars.bat не указано devDBName_${role}.`); }
	const host = variables.get(`oedbmshost_${role}`) ?? variables.get('oedbmshost') ?? 'localhost';
	const executablePath = path.join(workspacePath, 'bin', 'fme.exe');
	const executableStat = await stat(executablePath).catch(() => undefined);
	if (!executableStat?.isFile()) { throw new Error(`Не найден клиент Восточного Экспресса: ${executablePath}.`); }
	const extraArguments = vscode.workspace.getConfiguration('vcVeTools').get<string>(clientLaunchArgumentsSetting, '');
	const command = createClientLaunchCommand(workspacePath, role, { host, database }, credentials, openUri, extraArguments);
	const terminal = vscode.window.createTerminal({
		name: `ВЭ: запуск клиента (${role})`,
		cwd: workspacePath,
		shellPath: process.env.ComSpec ?? 'cmd.exe',
		shellArgs: ['/d'],
	});
	terminal.show();
	terminal.sendText(command, true);
	void vscode.window.showInformationMessage(openUri
		? `Команда открытия объекта в клиенте ВЭ отправлена: ${openUri}`
		: `Команда запуска клиента ВЭ отправлена: ${role === 'test' ? 'тестовая' : 'основная'} база.`);
}

export async function openProjectClientEntity(
	role: ProjectDatabaseRole,
	entityType: string,
	id: number,
	credentials: ClientCredentials = {},
): Promise<string> {
	if (!Number.isSafeInteger(id) || id <= 0) { throw new Error('ID объекта должен быть положительным целым числом.'); }
	const normalizedType = entityType.trim();
	if (!normalizedType || /[\/"\r\n]/.test(normalizedType)) { throw new Error('Тип сущности ВЭ указан некорректно.'); }
	const uri = `oe-${role === 'test' ? 'oetest' : 'oetrunk'}:/open/${normalizedType}/${id}`;
	await startProjectClient(role, credentials, uri);
	return uri;
}

function requireWorkspacePath(): string {
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
	return workspacePath;
}
