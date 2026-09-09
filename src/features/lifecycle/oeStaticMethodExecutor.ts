import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import { createLifecycleParameterMethodId } from './lifecycleMethodExecution';

export interface OeMethodCredentials { username?: string; password?: string }
export interface OeMethodExecutionResult { methodId: number; database: string; output: string }

const outputLimit = 1024 * 1024;

export function buildOeExecTaskArguments(
	methodId: number,
	methodParameter: string,
	database: string,
	host: string,
	credentials: OeMethodCredentials,
): string[] {
	if (methodId !== createLifecycleParameterMethodId) { throw new Error(`Метод ${methodId} не разрешён для прямого выполнения через MCP.`); }
	for (const [label, value] of [['database', database], ['host', host], ['username', credentials.username], ['password', credentials.password]] as const) {
		if (value && /[,"\r\n]/u.test(value)) { throw new Error(`${label} содержит символ, недопустимый в параметрах подключения OEExecTask.`); }
	}
	if (!database.trim()) { throw new Error('Не указана база для выполнения метода.'); }
	if (!credentials.username?.trim() || !credentials.password) {
		throw new Error('Для выполнения метода сохраните логин и пароль клиента Восточного Экспресса в настройках расширения.');
	}
	if (!methodParameter.trim() || /[;\r\n]/u.test(methodParameter)) { throw new Error('Параметр метода не должен быть пустым, многострочным или содержать точку с запятой.'); }
	const login = [host.trim() && `host=${host.trim()}`, `db=${database.trim()}`,
		credentials.username?.trim() && `Username=${credentials.username.trim()}`,
		credentials.password && `password=${credentials.password}`].filter(Boolean).join(',');
	return ['-l', login, `-MethodID=${methodId}`, `-MethodParam=${methodParameter}`, '-ForceOutputOEM'];
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
