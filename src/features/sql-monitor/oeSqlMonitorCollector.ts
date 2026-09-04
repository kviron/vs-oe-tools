import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, mkdir, readFile, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import { databaseProfileSetting } from '../../core/constants';
import { parseRdboadmIni, type RdboadmDatabase } from '../../infrastructure/configuration/rdboadmIni';
import type { SqlOperation } from './models';
import { sqlMonitorService } from './sqlMonitorService';

interface OeQueryRow {
	QueryID: number; UserID: number; UserName: string; ComputerName: string; ThreadID: number; CreationTimeStr: string; RecordCount: number;
	SQLTextFirstTable: string; ProcessedSQLText: string; SQLText: string; Params: string;
	SQLPattern: string;
	CreationTime: number;
	OpenTime: number; ExecTime: number; TotalTime: number; State: number;
}

type InspectorLogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
type InspectorLogger = (level: InspectorLogLevel, message: string, details?: unknown) => void;

export class OeSqlMonitorCollector implements vscode.Disposable {
	private running = false;
	private paused = false;
	private child: ChildProcessWithoutNullStreams | undefined;
	private lastQueryId = 0;
	private readonly seenExternalQueries = new Set<string>();
	private resumeWaiter: (() => void) | undefined;
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: SQL-инспектор');

	public constructor(private readonly storagePath: string) {
		for (const record of sqlMonitorService.getRecords()) {
			if (record.externalFingerprint) { this.seenExternalQueries.add(record.externalFingerprint); }
		}
	}

	public start(): void {
		if (this.running) {
			this.log('DEBUG', 'Повторный запуск пропущен: инспектор уже работает.');
			return;
		}
		this.running = true;
		this.log('INFO', `Запуск инспектора. Каталог результатов: ${this.storagePath}`);
		void this.run().catch(error => {
			if (this.running) {
				this.log('ERROR', 'Инспектор остановлен из-за ошибки.', error);
				this.output.show(true);
				void vscode.window.showErrorMessage(`Не удалось подключить монитор ВЕ: ${formatError(error)}`);
			}
		});
	}

	public dispose(): void {
		this.log('INFO', 'Остановка инспектора.');
		this.running = false;
		if (this.child?.stdin.writable) {
			this.log('DEBUG', `Отправка команды остановки процессу PID ${this.child.pid}.`);
			this.child.stdin.end('stop');
		}
		this.child = undefined;
		this.resumeWaiter?.();
		this.resumeWaiter = undefined;
		this.output.dispose();
	}

	public setPaused(paused: boolean): void {
		if (this.paused === paused) { return; }
		this.paused = paused;
		this.log('INFO', paused ? 'Сбор запросов приостановлен.' : 'Сбор запросов продолжен.');
		if (paused && this.child?.stdin.writable) { this.child.stdin.end('stop'); }
		if (!paused) {
			this.resumeWaiter?.();
			this.resumeWaiter = undefined;
		}
	}

	public isPaused(): boolean { return this.paused; }

	private async run(): Promise<void> {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) { throw new Error('Не открыта папка проекта.'); }
		this.log('INFO', `Рабочая папка: ${workspacePath}`);
		const log: InspectorLogger = (level, message, details) => this.log(level, message, details);
		const profile = await loadMonitorProfile(workspacePath, log);
		const port = requireTcpPort(profile);
		const userId = vscode.workspace.getConfiguration('vcVeTools').get<number>('userId', 0);
		this.log('INFO', `Выбран профиль [${profile.id}], TCP-порт ${port}, первичный фильтр UserID=${userId || '<отключён>'}.`);
		await ensureService(workspacePath, profile.id, port, log);
		await mkdir(this.storagePath, { recursive: true });
		const resultPath = path.join(this.storagePath, `sql-monitor-${profile.id}.sqdb`);
		const executable = path.join(workspacePath, 'bin', 'OESQLMonCon.exe');
		await access(executable).catch(error => { throw new Error(`Не найден OESQLMonCon.exe: ${executable}`, { cause: error }); });
		this.log('INFO', `Коллектор: ${executable}`);
		this.log('INFO', `Файл результата: ${resultPath}`);
		while (this.running) {
			await this.waitUntilResumed();
			if (!this.running) { break; }
			await unlink(resultPath).catch(error => {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
			});
			await this.capture(executable, port, resultPath);
			if (!this.running) { break; }
			const imported = this.importRows(resultPath, profile.id, userId);
			this.log('DEBUG', `Цикл завершён: импортировано ${imported}, последний QueryID ${this.lastQueryId}.`);
		}
	}

	private async waitUntilResumed(): Promise<void> {
		if (!this.paused) { return; }
		await new Promise<void>(resolve => { this.resumeWaiter = resolve; });
	}

	private async capture(executable: string, port: number, resultPath: string): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const args = [`-host=localhost:${port}`, `-resultdb=${resultPath}`];
			const helperPath = path.join(__dirname, 'sql-monitor-helper.js');
			this.log('DEBUG', `Запуск через отдельный PTY-процесс: ${executable} ${args.join(' ')}`);
			const child = spawn(process.execPath, [helperPath, executable, ...args], {
				cwd: path.dirname(executable),
				env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
				windowsHide: true,
			});
			this.child = child;
			this.log('DEBUG', `PTY helper запущен, PID ${child.pid ?? 'неизвестен'}.`);
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', chunk => { stdout += chunk.toString(); });
			child.stderr.on('data', chunk => { stderr += chunk.toString(); });
			child.once('error', error => {
				clearTimeout(watchdog);
				this.log('ERROR', 'Не удалось запустить PTY helper.', error);
				reject(error);
			});
			child.once('exit', (exitCode, signal) => {
				clearTimeout(watchdog);
				this.child = undefined;
				const cleanOutput = stripTerminalSequences([stdout, stderr].filter(Boolean).join('\n')).trim();
				const reportedError = /(?:EOSError|System Error|Exception|Ошибка)/i.test(cleanOutput);
				this.log(exitCode || reportedError ? 'WARNING' : 'DEBUG', `PTY helper завершён: код=${exitCode ?? 'null'}, сигнал=${signal ?? 'нет'}.`, cleanOutput || undefined);
				if ((exitCode || reportedError) && this.running) { reject(new Error(cleanOutput || `OESQLMonCon завершился с кодом ${exitCode}.`)); }
				else { resolve(); }
			});
			const watchdog = setTimeout(() => {
				this.log('ERROR', `PTY helper PID ${child.pid ?? 'неизвестен'} не завершился за 10 секунд.`);
				child.kill();
				reject(new Error('Превышено время ожидания PTY helper.'));
			}, 10_000);
		});
	}

	private importRows(resultPath: string, database: string, userId: number): number {
		this.log('DEBUG', `Чтение SQLite: ${resultPath}`);
		const db = new DatabaseSync(resultPath, { readOnly: true });
		try {
			const sql = 'SELECT QueryID, UserID, UserName, ComputerName, ThreadID, CreationTimeStr, CreationTime, RecordCount, SQLTextFirstTable, ProcessedSQLText, SQLText, SQLPattern, Params, OpenTime, ExecTime, TotalTime, State FROM Queries WHERE (? = 0 OR UserID = ?) ORDER BY QueryID';
			const rows = db.prepare(sql).all(userId, userId) as unknown as OeQueryRow[];
			const newestQueryId = db.prepare('SELECT COALESCE(MAX(QueryID), 0) AS QueryID FROM Queries').get() as { QueryID: number };
			this.lastQueryId = Math.max(this.lastQueryId, Number(newestQueryId.QueryID));
			let imported = 0;
			for (const row of rows) {
				const fingerprint = externalQueryFingerprint(row);
				if (this.seenExternalQueries.has(fingerprint)) { continue; }
				this.seenExternalQueries.add(fingerprint);
				const text = (row.ProcessedSQLText || row.SQLText || '').trim();
				sqlMonitorService.start({
					startedAt: new Date().toISOString(), source: 'VE-клиент', database,
					operation: detectOperation(text), status: row.State === 3 ? 'success' : 'running', text,
					parameters: row.Params ? [row.Params] : [], durationMs: secondsToMs(row.TotalTime),
					rowCount: row.RecordCount, columns: [], rows: [], resultTruncated: false,
					externalQueryId: Number(row.QueryID), externalFingerprint: fingerprint,
					userId: Number(row.UserID), userName: row.UserName, computerName: row.ComputerName,
					threadId: Number(row.ThreadID), sqlPattern: row.SQLPattern,
					creationTimeLabel: row.CreationTimeStr, firstTable: row.SQLTextFirstTable,
					openTimeMs: secondsToMs(row.OpenTime), execTimeMs: secondsToMs(row.ExecTime),
				});
				imported += 1;
			}
			return imported;
		} catch (error) {
			this.log('ERROR', 'Не удалось прочитать таблицу Queries из результата инспектора.', error);
			throw error;
		} finally {
			db.close();
		}
	}

	private log(level: InspectorLogLevel, message: string, details?: unknown): void {
		const suffix = details === undefined ? '' : `\n${formatError(details)}`;
		this.output.appendLine(`[${new Date().toISOString()}] ${level} ${message}${suffix}`);
	}
}

async function loadMonitorProfile(workspacePath: string, log: InspectorLogger): Promise<RdboadmDatabase> {
	const selected = vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, '');
	log('INFO', `Профиль из настройки vcVeTools.databaseProfile: ${selected || '<не задан>'}.`);
	for (const iniPath of [path.join(workspacePath, 'bin.win64', 'rdboadm.ini'), path.join(workspacePath, 'bin', 'rdboadm.ini')]) {
		try {
			log('DEBUG', `Чтение конфигурации: ${iniPath}`);
			const databases = parseRdboadmIni(iconv.decode(await readFile(iniPath), 'win1251'));
			log('DEBUG', `Найдено профилей: ${databases.length}. Идентификаторы: ${databases.map(item => item.id).join(', ') || '<нет>'}.`);
			const profile = databases.find(item => item.id.toLowerCase() === selected.toLowerCase()) ?? databases[0];
			if (profile) { return profile; }
		} catch (error) {
			log('WARNING', `Не удалось прочитать ${iniPath}.`, error);
		}
	}
	throw new Error('В rdboadm.ini не найден профиль базы данных.');
}

function requireTcpPort(profile: RdboadmDatabase): number {
	const port = Number(profile.fields.find(field => field.key.toLowerCase() === 'tcpport')?.value);
	if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error(`В профиле [${profile.id}] некорректный TCPport.`); }
	return port;
}

async function ensureService(workspacePath: string, alias: string, port: number, log: InspectorLogger): Promise<void> {
	log('DEBUG', `Проверка подключения к 127.0.0.1:${port}.`);
	if (await canConnect(port)) {
		log('INFO', `OEService уже доступен на порту ${port}.`);
		return;
	}
	const executable = path.join(workspacePath, 'bin.win64', 'oeservice.exe');
	await access(executable).catch(error => { throw new Error(`Не найден oeservice.exe: ${executable}`, { cause: error }); });
	log('INFO', `OEService недоступен. Запуск: ${executable} run -stdout -alias=${alias}`);
	const service = spawn(executable, ['run', '-stdout', `-alias=${alias}`], { cwd: path.dirname(executable), detached: true, stdio: 'ignore', windowsHide: true });
	service.once('error', error => log('ERROR', 'Ошибка запуска OEService.', error));
	service.unref();
	log('DEBUG', `Команда запуска OEService отправлена, PID ${service.pid ?? 'неизвестен'}.`);
	for (let attempt = 0; attempt < 20; attempt++) {
		await new Promise(resolve => setTimeout(resolve, 250));
		if (await canConnect(port)) {
			log('INFO', `OEService открыл порт ${port} после ${attempt + 1} проверок.`);
			return;
		}
	}
	throw new Error(`OEService не открыл порт ${port}.`);
}

function canConnect(port: number): Promise<boolean> {
	return new Promise(resolve => {
		const socket = createConnection({ host: '127.0.0.1', port });
		let settled = false;
		const finish = (value: boolean) => { if (!settled) { settled = true; socket.destroy(); resolve(value); } };
		socket.setTimeout(500);
		socket.once('connect', () => finish(true));
		socket.once('timeout', () => finish(false));
		socket.once('error', () => finish(false));
	});
}

function secondsToMs(value: number): number | undefined { return Number.isFinite(value) ? value * 1000 : undefined; }

function detectOperation(text: string): SqlOperation {
	const keyword = text.match(/^\s*(\w+)/)?.[1]?.toUpperCase();
	if (keyword === 'SELECT' || keyword === 'INSERT' || keyword === 'UPDATE' || keyword === 'DELETE') { return keyword; }
	if (keyword === 'CREATE' || keyword === 'ALTER' || keyword === 'DROP' || keyword === 'TRUNCATE') { return 'DDL'; }
	return 'OTHER';
}

function formatError(value: unknown): string {
	if (value instanceof Error) {
		const cause = value.cause === undefined ? '' : `\nПричина: ${formatError(value.cause)}`;
		return `${value.stack ?? value.message}${cause}`;
	}
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function stripTerminalSequences(value: string): string {
	return value.replace(/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, '');
}

function externalQueryFingerprint(row: OeQueryRow): string {
	return [row.UserID, row.ComputerName, row.ThreadID, row.CreationTime, row.SQLText, row.Params].join('\u001f');
}
