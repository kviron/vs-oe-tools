import { lstat, mkdir, readdir, rename, stat, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import { createBinaryUpdatePlan, type BinaryUpdatePlan } from './binaryUpdatePlan';
import { runProjectProcess, UpdateLog } from './projectUpdateProcess';

let updateRunning = false;

export async function updateProjectBinaries(): Promise<boolean> {
	if (updateRunning) { throw new Error('Обновление бинарников уже выполняется.'); }
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
	let plan: BinaryUpdatePlan;
	try { plan = await createBinaryUpdatePlan(workspacePath); }
	catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ERR_UNC_HOST_NOT_ALLOWED') {
			await offerUncHostAccess('172.20.0.109');
			return false;
		}
		throw error;
	}
	const answer = await vscode.window.showWarningMessage(
		'Обновить бинарники проекта?',
		{ modal: true, detail: `Сборка: ${plan.buildFolder}\nИсточник: ${plan.distributionPath}\nКлиент: ${plan.clientType}\nКаталоги: bin, bin.win64.` },
		'Обновить',
	);
	if (answer !== 'Обновить') { return false; }
	if (updateRunning) { throw new Error('Обновление бинарников уже выполняется.'); }
	updateRunning = true;
	const output = vscode.window.createOutputChannel('ВЭ: обновление бинарников');
	output.show(true);
	let log: UpdateLog | undefined;
	try {
		await mkdir(plan.logDir, { recursive: true });
		const logPath = path.join(plan.logDir, `binary-update-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
		await writeFile(logPath, '', { flag: 'wx' });
		log = new UpdateLog(output, logPath);
		const updateLog = log;
		updateLog.appendLine(`Сборка ${plan.buildFolder}. Журнал: ${logPath}`);
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Обновление бинарников', cancellable: false },
			async progress => runBinaryUpdate(plan, updateLog, progress),
		);
		await updateLog.flush();
		void vscode.window.showInformationMessage(`Бинарники обновлены до сборки ${plan.buildFolder}.`);
		return true;
	} catch (error) {
		log?.appendLine(`ОШИБКА: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	} finally {
		try { await log?.flush(); }
		finally { updateRunning = false; }
	}
}

async function offerUncHostAccess(host: string): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('security');
	const allowed = configuration.get<string[]>('allowedUNCHosts', []);
	if (allowed.some(value => value.toLowerCase() === host.toLowerCase())) {
		void vscode.window.showWarningMessage(`Узел ${host} уже разрешён в security.allowedUNCHosts. Перезапустите VS Code и повторите обновление.`);
		return;
	}
	const answer = await vscode.window.showWarningMessage(
		`Разрешить VS Code доступ к сетевому узлу ${host}?`,
		{ modal: true, detail: `Для обновления бинарников требуется чтение \\\\${host}\\oedistr. Узел будет добавлен в пользовательскую настройку security.allowedUNCHosts.` },
		'Разрешить узел',
	);
	if (answer !== 'Разрешить узел') { return; }
	await configuration.update('allowedUNCHosts', [...allowed, host], vscode.ConfigurationTarget.Global);
	void vscode.window.showInformationMessage(`Узел ${host} добавлен в security.allowedUNCHosts. Перезапустите VS Code, затем повторите обновление бинарников.`);
}

async function runBinaryUpdate(
	plan: BinaryUpdatePlan,
	log: UpdateLog,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<void> {
	const clientDir = path.join(plan.workspacePath, 'bin');
	const serverDir = path.join(plan.workspacePath, 'bin.win64');
	await mkdir(clientDir, { recursive: true });
	await mkdir(serverDir, { recursive: true });
	progress.report({ message: `Клиентская сборка ${plan.buildFolder}` });
	log.appendLine(`Обновление клиента: ${plan.clientType}.`);
	await runProjectProcess(plan.updaterPath, plan.clientArguments, clientDir, log, undefined, undefined, 'cp866');
	progress.report({ message: 'Серверные файлы и PostgreSQL UDF' });
	log.appendLine('Обновление серверных файлов и PostgreSQL UDF.');
	await runProjectProcess(plan.updaterPath, plan.serverArguments, serverDir, log, undefined, undefined, 'cp866');
	progress.report({ message: 'Проверка конфигурации bin.win64' });
	await finishBinaryUpdate(plan, log);
	log.appendLine(`Сборка ${plan.buildFolder} применена.`);
}

async function finishBinaryUpdate(plan: BinaryUpdatePlan, log: UpdateLog): Promise<void> {
	const clientDir = path.join(plan.workspacePath, 'bin');
	const serverDir = path.join(plan.workspacePath, 'bin.win64');
	const compatibilityPath = path.join(serverDir, 'OEExecTask.bat');
	if (!(await lstat(compatibilityPath).catch(() => undefined))) {
		await writeFile(compatibilityPath, 'call "%~dp0\\..\\bin\\OEExecTask.exe" %*\r\n');
		log.appendLine('Создана совместимая обёртка OEExecTask.bat.');
	}
	for (const prefix of ['OEScheduler', 'OEVoIP']) {
		const source = (await readdir(clientDir)).filter(name => name.startsWith(prefix) && name.toLowerCase().endsWith('.xml'));
		const target = (await readdir(serverDir)).some(name => name.startsWith(prefix) && name.toLowerCase().endsWith('.xml'));
		if (!target) {
			for (const name of source) { await rename(path.join(clientDir, name), path.join(serverDir, name)); }
			if (source.length) { log.appendLine(`Перенесено ${source.length} файлов ${prefix}*.xml в bin.win64.`); }
		}
	}
	const clientIni = path.join(clientDir, 'rdboadm.ini');
	const serverIni = path.join(serverDir, 'rdboadm.ini');
	if (!(await stat(serverIni).catch(() => undefined))?.isFile()) {
		if ((await stat(clientIni).catch(() => undefined))?.isFile()) {
			await rename(clientIni, serverIni);
			log.appendLine('rdboadm.ini перенесён в bin.win64.');
		} else {
			await writeFile(serverIni, iconv.encode(createRdboadmIni(plan.variables), 'win1251'), { flag: 'wx' });
			log.appendLine('rdboadm.ini создан из Vars.bat.');
		}
	}
	if (!(await lstat(clientIni).catch(() => undefined))) {
		await symlink(serverIni, clientIni, 'file');
		log.appendLine('Создана ссылка bin\\rdboadm.ini на bin.win64\\rdboadm.ini.');
	}
}

export function createRdboadmIni(variables: Map<string, string>): string {
	const release = variables.get('oerelease') || 'trunk';
	const dbmsPath = variables.get('oedbmspath');
	if (!dbmsPath) { throw new Error('В Vars.bat не указан oeDBMSPath.'); }
	const sections = (['main', 'test'] as const).map(role => {
		const database = variables.get(`devdbname_${role}`);
		if (!database) { throw new Error(`В Vars.bat не указан devDBName_${role}.`); }
		const host = variables.get(`oedbmshost_${role}`) || variables.get('oedbmshost') || 'localhost';
		const port = variables.get(`oedbmsport_${role}`) || variables.get('oedbmsport') || '5432';
		const user = variables.get('oedbmsusername') || 'postgres';
		const password = variables.get('oedbmspassword') || 'masterkey';
		const displayName = role === 'main' ? 'Основная база' : 'Тестовая база';
		return `[${database}]\r\nDispName = ${displayName}. Релиз ${release}\r\nTCPport = 3060\r\ndbtype = PG\r\ndbGDSdll=${path.join(dbmsPath, 'bin', 'libpq.dll')}\r\ndbpath = ${host}:${port}/${database}\r\ndbusername = ${user}\r\ndbpassword = ${password}\r\n`;
	});
	return sections.join('\r\n');
}
