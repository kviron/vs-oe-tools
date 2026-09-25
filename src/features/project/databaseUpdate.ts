import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import { Client } from 'pg';
import { assertGeneratedPatchScript, createDatabaseUpdatePlan, parseGeneratedFileList, type DatabaseUpdatePlan } from './databaseUpdatePlan';
import { runProjectProcess, UpdateLog } from './projectUpdateProcess';
import type { ProjectDatabaseRole } from './projectCommandService';

const expectedPatchKeys = ['-y', '-nointeractive', '-dontcheckdupfiles', '-dontregpatchfile', '-f', '-renamefinishedfilesfromlistfile'];
let updateRunning = false;

export async function updateProjectDatabase(role: ProjectDatabaseRole): Promise<void> {
	if (updateRunning) { throw new Error('Обновление базы уже выполняется.'); }
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
	const plan = await createDatabaseUpdatePlan(workspacePath, role);
	const answer = await vscode.window.showWarningMessage(
		`Обновить ${role === 'test' ? 'тестовую' : 'основную'} базу ${plan.database}?`,
		{ modal: true, detail: `Сервер: ${plan.host}:${plan.port}\nПакеты: ${plan.packagesPath}\nФайлы запуска: ${plan.tempPath}\nРежим: ${plan.generateOnly ? 'только формирование обновления' : 'формирование и применение'}.` },
		'Обновить',
	);
	if (answer !== 'Обновить') { return; }
	if (updateRunning) { throw new Error('Обновление базы уже выполняется.'); }
	updateRunning = true;
	const output = vscode.window.createOutputChannel(`ВЭ: обновление ${plan.database}`);
	output.show(true);
	let log: UpdateLog | undefined;
	try {
		await mkdir(plan.tempPath, { recursive: true });
		const logPath = path.join(plan.tempPath, `native-update-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
		await writeFile(logPath, '', { flag: 'wx' });
		log = new UpdateLog(output, logPath);
		const updateLog = log;
		updateLog.appendLine(`Журнал обновления ${plan.database}: ${logPath}`);
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Обновление ${plan.database}`, cancellable: true },
			async (progress, token) => {
				await runDatabaseUpdate(plan, updateLog, progress, token);
			},
		);
		await updateLog.flush();
		void vscode.window.showInformationMessage(plan.generateOnly
			? `Файлы обновления ${plan.database} сформированы в ${plan.tempPath}.`
			: `Обновление базы ${plan.database} завершилось успешно.`);
	} catch (error) {
		log?.appendLine(`ОШИБКА: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	} finally {
		try { await log?.flush(); }
		finally { updateRunning = false; }
	}
}

async function runDatabaseUpdate(
	plan: DatabaseUpdatePlan,
	log: UpdateLog,
	progress: vscode.Progress<{ message?: string; increment?: number }>,
	token: vscode.CancellationToken,
): Promise<void> {
	progress.report({ message: 'Проверка целевой базы' });
	const client = new Client({ host: plan.host, port: plan.port, database: plan.database, user: plan.user, password: plan.password });
	try {
		await client.connect();
		const result = await client.query<{ database: string }>('SELECT current_database() AS database');
		if (result.rows[0]?.database !== plan.database) { throw new Error('Фактическая база PostgreSQL не совпала с планом обновления.'); }
	} finally { await client.end().catch(() => undefined); }
	log.appendLine(`База подтверждена: ${plan.database} (${plan.host}:${plan.port}).`);
	if (token.isCancellationRequested) { throw new Error('Операция отменена.'); }
	await mkdir(plan.tempPath, { recursive: true });
	const startedAt = Date.now();
	progress.report({ message: 'OEPrjScript: формирование обновления' });
	log.appendLine('Формирование обновления OEPrjScript.exe...');
	await runProjectProcess(plan.generatorPath, [
		'-recognizeindices', '-loadalldbpackages', ...plan.generatorOptions,
		`-savefilegroup=${plan.tempPath}${path.sep}`,
		`-e=${path.join(plan.tempPath, 'error.log')}`,
		`-logname=${path.join(plan.tempPath, 'oeprjscript.log')}`,
		'-v2', '-l', `db=${plan.database}`, plan.packagesPath,
	], plan.workspacePath, log, token);
	const scriptPath = path.join(plan.tempPath, 'exec.bat');
	const scriptStat = await stat(scriptPath);
	if (scriptStat.mtimeMs < startedAt - 2000) { throw new Error('OEPrjScript не создал новый exec.bat.'); }
	const script = iconv.decode(await readFile(scriptPath), 'win1251');
	const { build } = assertGeneratedPatchScript(script, plan.database);
	const listPath = path.join(plan.tempPath, 'files.lst');
	const listStat = await stat(listPath);
	if (listStat.mtimeMs < startedAt - 2000) { throw new Error('OEPrjScript не создал новый files.lst.'); }
	const files = parseGeneratedFileList(iconv.decode(await readFile(listPath), 'win1251'), plan.tempPath);
	for (const file of files) {
		if (!(await stat(path.resolve(plan.tempPath, file)).catch(() => undefined))?.isFile()) { throw new Error(`Не найден файл обновления ${file}.`); }
	}
	log.appendLine(`Создано файлов обновления: ${files.length}.`);
	if (plan.generateOnly) { return; }
	if (token.isCancellationRequested) { throw new Error('Операция отменена до применения.'); }
	progress.report({ message: `OEPatch: применение ${files.length} файлов, дождитесь завершения` });
	log.appendLine(`Применение ${files.length} файлов через OEPatch.exe...`);
	await runProjectProcess(plan.patchPath, [...expectedPatchKeys, '-l', `db=${plan.database}`, 'files.lst'], plan.tempPath, log, undefined, build ? { OEPATCHCHECKBUILD: build } : undefined);
	const remaining = (await readdir(plan.tempPath)).filter(file => /\.rde$/i.test(file));
	if (remaining.length) { throw new Error(`OEPatch завершился, но осталось ${remaining.length} файлов .rde. Проверьте журнал применения.`); }
	for (const file of await readdir(plan.tempPath)) {
		if (/\.donepatch$/i.test(file)) { await rm(path.join(plan.tempPath, file)); }
	}
	progress.report({ message: 'Проверка базы после обновления' });
	const verify = new Client({ host: plan.host, port: plan.port, database: plan.database, user: plan.user, password: plan.password });
	try {
		await verify.connect();
		const result = await verify.query<{ database: string }>('SELECT current_database() AS database');
		if (result.rows[0]?.database !== plan.database) { throw new Error('После обновления подключение оказалось в другой базе.'); }
	} finally { await verify.end().catch(() => undefined); }
	log.appendLine(`Подключение к ${plan.database} после обновления проверено.`);
}
