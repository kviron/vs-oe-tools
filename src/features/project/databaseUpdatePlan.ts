import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import { parseVarsFile } from '../../infrastructure/configuration/projectDatabaseOptions';
import { loadRdboadmDatabases, rdboadmDatabaseOptions } from '../../infrastructure/configuration/rdboadmIni';
import type { ProjectDatabaseRole } from './projectCommandService';

export interface DatabaseUpdatePlan {
	workspacePath: string;
	role: ProjectDatabaseRole;
	database: string;
	host: string;
	port: number;
	user: string;
	password: string;
	packagesPath: string;
	tempPath: string;
	generatorPath: string;
	patchPath: string;
	generatorOptions: string[];
	generateOnly: boolean;
}

export async function createDatabaseUpdatePlan(workspacePath: string, role: ProjectDatabaseRole): Promise<DatabaseUpdatePlan> {
	const vars = parseVarsFile(iconv.decode(await readFile(path.join(workspacePath, 'Vars.bat')), 'win1251'));
	const roleValue = (name: string) => vars.get(`${name}_${role}`) ?? vars.get(name);
	const database = vars.get(`devdbname_${role}`)?.trim();
	if (!database || !/^[\w-]+$/.test(database)) { throw new Error(`Проверьте devDBName_${role} в Vars.bat.`); }
	const port = Number(roleValue('oedbmsport') ?? '5432');
	if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error('Некорректный oeDBMSPort в Vars.bat.'); }
	const packagesPath = resolveProjectPath(workspacePath, roleValue('devpathpackages') ?? 'Packages');
	const tempRoot = resolveProjectPath(workspacePath, vars.get('devpathtemp') ?? 'Temp');
	const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
	const tempPath = path.join(tempRoot, `${role}-${runId}`);
	const generatorPath = path.join(workspacePath, 'Bin', 'OEPrjScript.exe');
	const patchPath = path.join(workspacePath, 'Bin', 'oepatch.exe');
	for (const file of [generatorPath, patchPath]) {
		if (!(await stat(file).catch(() => undefined))?.isFile()) { throw new Error(`Не найден ${file}.`); }
	}
	if (!(await stat(packagesPath).catch(() => undefined))?.isDirectory()) { throw new Error(`Не найдена папка пакетов: ${packagesPath}.`); }
	const generatorOptions = parseGeneratorOptions(vars.get(`devprjscriptopts_${role}`) ?? '');
	const { databases } = await loadRdboadmDatabases(workspacePath);
	const alias = databases.find(item => item.id.toLowerCase() === database.toLowerCase());
	if (!alias) { throw new Error(`База ${database} отсутствует в bin\\rdboadm.ini.`); }
	const resolved = rdboadmDatabaseOptions(alias);
	const host = roleValue('oedbmshost') || 'localhost';
	if (resolved.database.toLowerCase() !== database.toLowerCase()
		|| resolved.host.toLowerCase() !== host.toLowerCase() || resolved.port !== port) {
		throw new Error(`Vars.bat и bin\\rdboadm.ini по-разному указывают базу ${database}.`);
	}
	return {
		workspacePath, role, database,
		host,
		port,
		user: roleValue('oedbmsusername') || 'postgres',
		password: roleValue('oedbmspassword') || 'masterkey',
		packagesPath, tempPath, generatorPath, patchPath, generatorOptions,
		generateOnly: Boolean(vars.get('devupdatedbnoexec')),
	};
}

function resolveProjectPath(workspacePath: string, value: string): string {
	const expanded = value.replace(/%~dp0/gi, `${workspacePath}${path.sep}`);
	if (/%[^%]+%/.test(expanded)) { throw new Error(`Не удалось разрешить путь из Vars.bat: ${value}`); }
	return path.resolve(workspacePath, expanded);
}

export function parseGeneratorOptions(value: string): string[] {
	const options = value.trim() ? value.trim().split(/\s+/) : [];
	if (options.some(option => !/^-[a-z][a-z0-9-]*(?:=[a-z0-9._-]+)?$/i.test(option))) {
		throw new Error('devPrjScriptOpts содержит неподдерживаемые параметры.');
	}
	return options;
}

export function assertGeneratedPatchScript(source: string, database: string): { build?: string } {
	source = source.replace(/\r\n/g, '\n');
	const value = (name: string) => source.match(new RegExp(`^SET ${name}=(.*)$`, 'im'))?.[1]?.trim();
	if (value('OEDBCONNECTDATA') !== `-l db=${database}`) { throw new Error('Созданный exec.bat указывает другую базу или изменённый формат подключения.'); }
	if (!/^\.\.\\\.\.\\Bin\\oepatch\.exe$/i.test(value('OEPATCH') ?? '')) { throw new Error('Неизвестный путь OEPatch в созданном exec.bat.'); }
	if (value('OEGROUPNAMEPREFIX') !== '') { throw new Error('Неизвестная группа файлов в созданном exec.bat.'); }
	if (value('OEMAINKEYS') !== '-y -nointeractive -dontcheckdupfiles -dontregpatchfile -f -renamefinishedfilesfromlistfile %OEPATCHEXECADDITIONALKEYS%') {
		throw new Error('Параметры OEPatch в созданном exec.bat изменились.');
	}
	if (!/^%OEPATCH% %OEMAINKEYS% %OEDBCONNECTDATA% %OEGROUPNAMEPREFIX%files\.lst$/im.test(source)) {
		throw new Error('Команда OEPatch в созданном exec.bat изменилась.');
	}
	return { build: value('OEPATCHCHECKBUILD') };
}

export function parseGeneratedFileList(source: string, tempPath: string): string[] {
	const files = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
	const normalizedTemp = path.resolve(tempPath).toLowerCase();
	if (!files.length || files.some(file => !/\.rde$/i.test(file)
		|| path.dirname(path.resolve(tempPath, file)).toLowerCase() !== normalizedTemp)) {
		throw new Error('Созданный files.lst пуст или содержит неожиданные пути.');
	}
	return files;
}
