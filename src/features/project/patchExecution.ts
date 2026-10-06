import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { readFile, realpath, mkdir, writeFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import { Client } from 'pg';
import { createDatabaseUpdatePlan } from './databaseUpdatePlan';
import { runProjectProcess, UpdateLog } from './projectUpdateProcess';

export interface PatchInput {
	role: 'main' | 'test';
	patchFile: string;
	packageChanges?: 'deny' | 'allowAndLog';
	expectedDatabase: string;
	expectedHost: string;
	expectedPort: number;
}
let running = false;

/** Executes one reviewed snapshot through the native patch runner, never retries. */
export async function executeProjectPatch(input: PatchInput): Promise<Record<string, unknown>> {
	if (running) { throw new Error('Патч уже выполняется.'); }
	const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspace) { throw new Error('Откройте проект Восточного Экспресса.'); }
	const plan = await createDatabaseUpdatePlan(workspace, input.role, true);
	if (plan.database !== input.expectedDatabase || plan.host !== input.expectedHost || plan.port !== input.expectedPort) {
		throw new Error('Целевая база патча не совпадает с явно указанным подключением.');
	}
	const file = await realpath(path.resolve(workspace, input.patchFile));
	if (!/\.(rde|sql)$/i.test(file) || !(await stat(file)).isFile()) {
		throw new Error('Укажите файл патча .rde или .sql.');
	}
	const bytes = await readFile(file);
	if (!bytes.length || bytes.length > 5 * 1024 * 1024) { throw new Error('Размер патча должен быть от 1 байта до 5 МБ.'); }
	if (bytes.includes(0) || bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
		throw new Error('Ожидается патч Windows-1251 без BOM.');
	}
	if (bytes.some(byte => byte > 127) && isUtf8(bytes)) {
		throw new Error('Файл похож на UTF-8. Сохраните патч в Windows-1251.');
	}
	const hash = createHash('sha256').update(bytes).digest('hex');
	const packageChanges = input.packageChanges ?? 'deny';
	const target = { database: plan.database, host: plan.host, port: plan.port, role: input.role, packageChanges };
	const choice = await vscode.window.showWarningMessage(`Применить патч к базе ${plan.database}?`, {
		modal: true,
		detail: `${plan.host}:${plan.port}\n${file}\nИзменения пакетов: ${packageChanges === 'allowAndLog' ? 'разрешены с регистрацией (-allowandlogpkgchanges)' : 'без дополнительного разрешения'}\nSHA-256: ${hash}\n\n${iconv.decode(bytes, 'win1251')}\n\nПатч может содержать COMMIT; при ошибке часть изменений может сохраниться.`,
	}, 'Применить патч');
	if (choice !== 'Применить патч') { return { ...target, executed: false, cancelled: true, hash }; }
	if (running) { throw new Error('Патч уже выполняется.'); }
	running = true;
	let log: UpdateLog | undefined;
	let started = false;
	try {
		const client = new Client({ host: plan.host, port: plan.port, database: plan.database, user: plan.user, password: plan.password });
		try {
			await client.connect();
			const result = await client.query<{ database: string }>('select current_database() as database');
			if (result.rows[0]?.database !== plan.database) { throw new Error('Подключение оказалось в другой базе.'); }
		} finally { await client.end().catch(() => undefined); }
		await mkdir(plan.tempPath, { recursive: true });
		await writeFile(path.join(plan.tempPath, 'patch.rde'), bytes, { flag: 'wx' });
		await writeFile(path.join(plan.tempPath, 'files.lst'), 'patch.rde\r\n', { flag: 'wx' });
		const logPath = path.join(plan.tempPath, 'patch-execution.log');
		await writeFile(logPath, '', { flag: 'wx' });
		const output = vscode.window.createOutputChannel(`ВЭ: патч ${plan.database}`);
		output.show(true);
		log = new UpdateLog(output, logPath);
		log.appendLine(`База: ${plan.database} (${plan.host}:${plan.port}); SHA-256: ${hash}`);
		started = true;
		await runProjectProcess(plan.patchPath, [
			'-y', '-nointeractive', '-dontregpatchfile', '-f', '-renamefinishedfilesfromlistfile',
			...(packageChanges === 'allowAndLog' ? ['-allowandlogpkgchanges'] : []),
			'-ForceOutputOEM', '-l', `db=${plan.database}`,
			`-e=${path.join(plan.tempPath, 'errors.log')}`,
			`-logname=${path.join(plan.tempPath, 'oepatch.log')}`, 'files.lst',
		], plan.tempPath, log, undefined, undefined, 'cp866');
		if (!(await stat(path.join(plan.tempPath, 'patch.donepatch')).catch(() => undefined))?.isFile()) {
			throw new Error('OEPatch не отметил файл как успешно выполненный.');
		}
		const errors = await readFile(path.join(plan.tempPath, 'errors.log')).catch(() => Buffer.alloc(0));
		if (errors.toString().trim()) { throw new Error('OEPatch создал непустой журнал ошибок.'); }
		return { ...target, executed: true, passed: true, hash, logPath, runDirectory: plan.tempPath };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log?.appendLine(`Ошибка: ${message}`);
		return { ...target, executed: started, passed: false, mayHavePartialChanges: started, hash,
			error: message, runDirectory: plan.tempPath, logPath: log?.path };
	} finally {
		try { await log?.flush(); } finally { running = false; }
	}
}
