import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
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
export const postmanApiMethodId = 41654685;

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

export async function startPostmanApiProcess(
	workspacePath: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): Promise<{ methodId: number; database: string; processId?: number }> {
	return startDetachedMethodProcess(
		workspacePath,
		postmanApiMethodId,
		buildPostmanApiStartArguments(database, host, credentials),
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
	args.splice(-1, 0, '-MethodParam=1');
	return args;
}

export function buildPostmanApiStartArguments(
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): string[] {
	const args = buildConnectionArguments(postmanApiMethodId, database, host, credentials);
	args.splice(-1, 0, '-MethodParam=1');
	return args;
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
	const login = [host.trim() && `host=${host.trim()}`, `db=${database.trim()}`,
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
