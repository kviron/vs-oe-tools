import { readFile, stat } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import { parseVarsFile } from '../../infrastructure/configuration/projectDatabaseOptions';

const distributionPath = '\\\\172.20.0.109\\oedistr';
const buildNamePattern = /^[\w().-]+$/;

export interface BinaryUpdatePlan {
	workspacePath: string;
	distributionPath: string;
	buildFolder: string;
	clientType: string;
	clientIni: string;
	serverIni: string;
	updaterPath: string;
	clientArguments: string[];
	serverArguments: string[];
	logDir: string;
	variables: Map<string, string>;
}

export async function createBinaryUpdatePlan(workspacePath: string): Promise<BinaryUpdatePlan> {
	const variables = parseVarsFile(iconv.decode(await readFile(path.join(workspacePath, 'Vars.bat')), 'win1251'));
	const dbmsPath = variables.get('oedbmspath');
	if (!dbmsPath) { throw new Error('В Vars.bat не указан oeDBMSPath.'); }
	const release = variables.get('oerelease') || '';
	let buildFolder = variables.get('devbuildfolder') || release || 'current';
	if (!buildNamePattern.test(buildFolder)) { throw new Error('Некорректное имя сборки в Vars.bat.'); }
	const aliasPath = path.join(distributionPath, 'Builds', `${buildFolder}.bat`);
	const alias = await readBuildAlias(aliasPath, path.join(distributionPath, 'Builds', buildFolder));
	if (alias) {
		buildFolder = parseBuildAlias(iconv.decode(alias, 'win1251'), aliasPath);
	}
	const buildPath = path.join(distributionPath, 'Builds', buildFolder);
	if (!(await stat(buildPath).catch(() => undefined))?.isDirectory()) { throw new Error(`Сборка не найдена: ${buildPath}.`); }
	const updaterPath = path.join(distributionPath, 'Tools', 'OEUpdater.exe');
	if (!(await stat(updaterPath).catch(() => undefined))?.isFile()) { throw new Error(`Не найден ${updaterPath}.`); }
	const clientPlatform = variables.get('devbuildclientplatform') || '';
	if (clientPlatform && clientPlatform !== 'x64') { throw new Error('Поддерживается только devBuildClientPlatform=x64 или пустое значение.'); }
	const buildType = variables.get('devbuildfoldertype') || 'Deb';
	if (!/^[a-z0-9_-]+$/i.test(buildType)) { throw new Error('Некорректный devBuildFolderType.'); }
	const clientType = `${buildType}${clientPlatform}`;
	const clientIni = path.join(buildPath, 'OEUpdClientDev.ini');
	const serverIni = path.join(buildPath, 'OEUpdServer.ini');
	for (const ini of [clientIni, serverIni]) {
		if (!(await stat(ini).catch(() => undefined))?.isFile()) { throw new Error(`Не найден файл обновления ${ini}.`); }
	}
	const relativeBuild = path.join('Builds', buildFolder);
	const tempValue = (variables.get('devpathtemp') || 'Temp').replace(/%~dp0/gi, `${workspacePath}${path.sep}`);
	if (/%[^%]+%/.test(tempValue)) { throw new Error('Не удалось разрешить devPathTemp из Vars.bat.'); }
	return {
		workspacePath, distributionPath, buildFolder, clientType, clientIni, serverIni, updaterPath, variables,
		logDir: path.resolve(workspacePath, tempValue),
		clientArguments: [clientIni, distributionPath, relativeBuild, clientType, `-oeClientPlatform=${clientPlatform}`],
		serverArguments: [serverIni, distributionPath, relativeBuild, 'Deb', `-oeDBUDFPath=${path.join(dbmsPath, 'lib')}`, '-oeDBMSPlatform=x64'],
	};
}

async function readBuildAlias(aliasPath: string, directBuildPath: string): Promise<Buffer | undefined> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try { return await readFile(aliasPath); }
		catch (error) {
			lastError = error;
			if ((error as NodeJS.ErrnoException)?.code === 'ERR_UNC_HOST_NOT_ALLOWED') { throw error; }
			if (attempt < 2) { await setTimeout(250); }
		}
	}
	if ((lastError as NodeJS.ErrnoException)?.code === 'ENOENT'
		&& (await stat(directBuildPath).catch(() => undefined))?.isDirectory()) {
		return undefined;
	}
	const code = (lastError as NodeJS.ErrnoException)?.code ?? String(lastError);
	throw new Error(`Не удалось прочитать алиас сборки ${aliasPath} (${code}). Проверьте доступ к сетевому ресурсу из VS Code.`);
}

export function parseBuildAlias(source: string, aliasPath: string): string {
	const match = source.trim().match(/^@?set\s+BuildFolder=([\w().-]+)$/i);
	if (!match) { throw new Error(`Неподдерживаемый алиас сборки: ${aliasPath}.`); }
	return match[1];
}
