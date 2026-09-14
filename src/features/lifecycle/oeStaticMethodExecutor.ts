import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, stat, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import { createLifecycleParameterMethodId } from './lifecycleMethodExecution';

export interface OeMethodCredentials { username?: string; password?: string }
export interface OeMethodExecutionResult { methodId: number; database: string; output: string }

const outputLimit = 1024 * 1024;
export const clientMcpMethodIds = {
	start: 12464780,
	stop: 12464782,
};
export const httpTestServerMethodId = 3200176;

export interface HttpTestServerProcess {
	methodName: string;
	database: string;
	url: string;
	processId?: number;
	isRunning(): boolean;
	stop(): Promise<void>;
}

export function buildOeExecTaskArguments(
	methodId: number,
	methodParameter: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): string[] {
	if (methodId !== createLifecycleParameterMethodId) { throw new Error(`Метод ${methodId} не разрешён для прямого выполнения через MCP.`); }
	if (!methodParameter.trim() || /[;\r\n]/u.test(methodParameter)) { throw new Error('Параметр метода не должен быть пустым, многострочным или содержать точку с запятой.'); }
	const args = buildConnectionArguments(methodId, database, host, credentials);
	args.splice(-1, 0, `-MethodParam=${methodParameter}`);
	return args;
}

export async function executeOeStaticMethod(
	workspacePath: string,
	methodId: number,
	methodParameter: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): Promise<OeMethodExecutionResult> {
	const executable = path.join(workspacePath, 'bin', 'OEExecTask.exe');
	if (!(await stat(executable).catch(() => undefined))?.isFile()) { throw new Error(`Не найден ${executable}.`); }
	const args = buildOeExecTaskArguments(methodId, methodParameter, database, host, credentials);
	const output = await run(executable, args, path.dirname(executable));
	return { methodId, database, output };
}

export async function startClientMcpProcess(
	workspacePath: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): Promise<{ methodId: number; database: string; processId?: number }> {
	return startDetachedMethodProcess(
		workspacePath,
		clientMcpMethodIds.start,
		buildClientMcpStartArguments(database, host, credentials),
		database,
	);
}

async function startDetachedMethodProcess(
	workspacePath: string,
	methodId: number,
	args: string[],
	database: string,
): Promise<{ methodId: number; database: string; processId?: number }> {
	const executable = path.join(workspacePath, 'bin', 'OEExecTask.exe');
	if (!(await stat(executable).catch(() => undefined))?.isFile()) { throw new Error(`Не найден ${executable}.`); }
	const child = spawn(executable, args, {
		cwd: path.dirname(executable),
		windowsHide: true,
		shell: false,
		detached: false,
		stdio: 'ignore',
	});
	await new Promise<void>((resolve, reject) => {
		child.once('spawn', resolve);
		child.once('error', reject);
	});
	child.unref();
	return { methodId, database, processId: child.pid };
}

export function buildClientMcpStartArguments(
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): string[] {
	const args = buildConnectionArguments(clientMcpMethodIds.start, database, host, credentials);
	args[1] += ',Shell=Настройка';
	args.splice(-1, 0, '-MethodParam=1');
	return args;
}

export async function startHttpTestServerProcess(
	workspacePath: string,
	methodName: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): Promise<HttpTestServerProcess> {
	const normalizedMethodName = methodName.trim();
	if (!normalizedMethodName || /[,;"\r\n]/u.test(normalizedMethodName)) { throw new Error('Имя HTTP-метода содержит недопустимые символы.'); }
	const executable = path.join(workspacePath, 'bin', 'OEExecTask.exe');
	if (!(await stat(executable).catch(() => undefined))?.isFile()) { throw new Error(`Не найден ${executable}.`); }
	const urlFile = path.join(path.dirname(executable), 'vcve_http_url.txt');
	await unlink(urlFile).catch(() => undefined);
	const args = buildHttpTestServerArguments(normalizedMethodName, database, host, credentials);
	const child = spawn(executable, args, { cwd: path.dirname(executable), windowsHide: true, shell: false });
	let url: string;
	try { url = await waitForHttpServerUrl(child, urlFile); }
	catch (error) { child.kill(); throw error; }
	return {
		methodName: normalizedMethodName,
		database,
		url,
		processId: child.pid,
		isRunning: () => child.exitCode === null && !child.killed,
		stop: () => stopChildProcess(child),
	};
}

export function buildHttpTestServerArguments(
	methodName: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): string[] {
	const normalizedMethodName = methodName.trim();
	if (!normalizedMethodName || /[,;"\r\n]/u.test(normalizedMethodName)) { throw new Error('Имя HTTP-метода содержит недопустимые символы.'); }
	const args = buildConnectionArguments(httpTestServerMethodId, database, host, credentials);
	args[1] += ',Shell=Настройка';
	args.splice(-1, 0, `-MethodParam=${buildHttpTestServerMethodParameter(normalizedMethodName, credentials.username!)}`);
	return args;
}

export function buildHttpTestServerMethodParameter(methodName: string, username: string): string {
	const normalizedMethodName = methodName.trim();
	const normalizedUsername = username.trim();
	if (!normalizedMethodName || /[,;="\r\n]/u.test(normalizedMethodName)) {
		throw new Error('Имя HTTP-метода содержит недопустимые символы.');
	}
	if (!normalizedUsername || /[,;="\r\n]/u.test(normalizedUsername)) {
		throw new Error('Логин клиента содержит недопустимые символы для запуска тестового HTTP-сервера.');
	}
	return `method=${normalizedMethodName},username=${normalizedUsername}`;
}

function buildConnectionArguments(
	methodId: number,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): string[] {
	for (const [label, value] of [['database', database], ['host', host], ['username', credentials.username], ['password', credentials.password]] as const) {
		if (value && /[,"\r\n]/u.test(value)) { throw new Error(`${label} содержит символ, недопустимый в параметрах подключения OEExecTask.`); }
	}
	if (!database.trim()) { throw new Error('Не указана база для выполнения метода.'); }
	if (!credentials.username?.trim() || !credentials.password) {
		throw new Error('Для выполнения метода сохраните логин и пароль клиента Восточного Экспресса в настройках расширения.');
	}
	const login = [host.trim() && `host=${host.trim()}`, `db=${database.trim()}`, 'MultiLogin=True',
		credentials.username?.trim() && `Username=${credentials.username.trim()}`,
		credentials.password && `password=${credentials.password}`].filter(Boolean).join(',');
	return ['-l', login, `-MethodID=${methodId}`, '-ForceOutputOEM'];
}

async function run(executable: string, args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, { cwd, windowsHide: true, shell: false });
		const chunks: Buffer[] = [];
		let size = 0;
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) { return; }
			settled = true;
			child.kill();
			reject(new Error('Выполнение метода Восточного Экспресса превысило 120 секунд.'));
		}, 120_000);
		const collect = (chunk: Buffer) => {
			size += chunk.length;
			if (size <= outputLimit) { chunks.push(chunk); }
		};
		child.stdout.on('data', collect);
		child.stderr.on('data', collect);
		child.once('error', error => finish(() => reject(error)));
		child.once('close', code => finish(() => {
			const output = iconv.decode(Buffer.concat(chunks), 'cp866').trim();
			if (code !== 0) { reject(new Error(output || `OEExecTask завершился с кодом ${code}.`)); }
			else { resolve(output); }
		}));
		function finish(action: () => void): void {
			if (settled) { return; }
			settled = true;
			clearTimeout(timer);
			action();
		}
	});
}

async function waitForHttpServerUrl(child: ChildProcess, urlFile: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const decoder = iconv.getDecoder('cp866');
		let output = '';
		let settled = false;
		const timer = setTimeout(() => finish(() => reject(new Error('Тестовый HTTP-сервер не сообщил адрес за 15 секунд.'))), 15_000);
		const fileTimer = setInterval(() => {
			void readFile(urlFile, 'utf8').then(value => {
				const url = value.trim();
				if (/^https?:\/\/\S+$/u.test(url)) { finish(() => resolve(url)); }
			}).catch(() => undefined);
		}, 100);
		const collect = (chunk: Buffer) => {
			output = (output + decoder.write(chunk)).slice(-outputLimit);
			const match = output.match(/VCVE_HTTP_URL=(https?:\/\/[^\s]+)/u);
			if (match) { finish(() => resolve(match[1])); }
		};
		child.stdout?.on('data', collect);
		child.stderr?.on('data', collect);
		child.once('error', error => finish(() => reject(error)));
		child.once('close', code => finish(() => reject(new Error(output.trim() || `OEExecTask завершился с кодом ${code}.`))));
		function finish(action: () => void): void {
			if (settled) { return; }
			settled = true;
			clearTimeout(timer);
			clearInterval(fileTimer);
			action();
		}
	});
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.killed) { return; }
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Процесс тестового HTTP-сервера не остановился.')), 5_000);
		child.once('close', () => { clearTimeout(timer); resolve(); });
		if (!child.kill()) { clearTimeout(timer); reject(new Error('Не удалось остановить процесс тестового HTTP-сервера.')); }
	});
}
