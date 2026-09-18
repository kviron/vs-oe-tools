import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { buildHttpTestServerArguments, type OeMethodCredentials } from '../lifecycle/oeStaticMethodExecutor';

export interface DirectHttpMethodRequest { methodName: string; parameters: Record<string, string> }
export interface DirectHttpMethodResponse {
	execution: 'direct'; status: number; statusText: string; durationMs: number;
	headers: Record<string, string>; cookies: string[]; body: string; bodySizeBytes: number;
	contentType: string; url: string; redirected: boolean;
}
const maximumRequestBytes = 1024 * 1024;
const maximumResponseBytes = 16 * 1024 * 1024;

export function validateDirectHttpMethodRequest(input: unknown): DirectHttpMethodRequest {
	if (!input || typeof input !== 'object') { throw new Error('Не задан вызов метода.'); }
	const { methodName, parameters } = input as DirectHttpMethodRequest;
	if (typeof methodName !== 'string' || !methodName.trim() || methodName.trim() === '*' || /[,;="\r\n]/u.test(methodName)) {
		throw new Error('Выберите один метод из каталога HTTP API.');
	}
	if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)
		|| Object.entries(parameters).some(([key, value]) => !key || typeof value !== 'string')) {
		throw new Error('Параметры должны быть объектом со строковыми значениями.');
	}
	const request = { methodName: methodName.trim(), parameters };
	if (Buffer.byteLength(JSON.stringify(request), 'utf8') > maximumRequestBytes) { throw new Error('Параметры превышают 1 МБ.'); }
	return request;
}

// ASCII JSON remains lossless when read by the native Windows-1251 text reader.
export function encodeDirectHttpMethodRequest(request: DirectHttpMethodRequest): string {
	const validated = validateDirectHttpMethodRequest(request);
	return JSON.stringify({ protocol: 'vcve-direct-v1', methodName: validated.methodName,
		parameters: Object.entries(validated.parameters).map(([name, value]) => ({ name, value })) })
		.replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function buildDirectHttpMethodArguments(request: DirectHttpMethodRequest, database: string, host: string,
	credentials: OeMethodCredentials, requestFile: string, responseFile: string): string[] {
	for (const file of [requestFile, responseFile]) {
		if (!path.isAbsolute(file) || /[,;="\r\n]/u.test(file)) { throw new Error('Путь временного файла содержит недопустимые символы.'); }
	}
	const args = buildHttpTestServerArguments(validateDirectHttpMethodRequest(request).methodName, database, host, credentials);
	const index = args.findIndex(arg => arg.startsWith('-MethodParam='));
	args[index] += `,requestFile=${requestFile},responseFile=${responseFile}`;
	return args;
}

export function parseDirectHttpMethodResponse(bytes: Buffer, durationMs: number): DirectHttpMethodResponse {
	if (bytes.length > maximumResponseBytes) { throw new Error('Результат метода превышает 16 МБ.'); }
	let envelope: { protocol?: unknown; ok?: unknown; body?: unknown; error?: unknown };
	try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '')); }
	catch { throw new Error('Исполнитель не вернул корректный UTF-8 JSON. Проверьте версию метода 3200176 в выбранной базе.'); }
	if (!envelope || envelope.protocol !== 'vcve-direct-v1' || typeof envelope.ok !== 'boolean') {
		throw new Error('Несовместимая версия нативного исполнителя метода 3200176.');
	}
	if (!envelope.ok) { throw new Error(typeof envelope.error === 'string' ? envelope.error : 'Ошибка выполнения метода.'); }
	if (typeof envelope.body !== 'string') { throw new Error('Исполнитель не вернул тело результата.'); }
	JSON.parse(envelope.body); // The transport must not silently turn broken serialization into success.
	return {
		execution: 'direct', status: 0, statusText: 'Выполнено', durationMs, headers: {}, cookies: [], body: envelope.body,
		bodySizeBytes: Buffer.byteLength(envelope.body, 'utf8'), contentType: 'application/json; charset=utf-8',
		url: '', redirected: false,
	};
}

export async function executeDirectHttpMethod(workspacePath: string, request: DirectHttpMethodRequest,
	database: string, host: string, credentials: OeMethodCredentials, signal?: AbortSignal): Promise<DirectHttpMethodResponse> {
	const encoded = encodeDirectHttpMethodRequest(request);
	const bin = path.resolve(workspacePath, 'bin');
	const executable = path.join(bin, 'OEExecTask.exe');
	if (!(await stat(executable).catch(() => undefined))?.isFile()) { throw new Error(`Не найден ${executable}.`); }
	const directory = await mkdtemp(path.join(bin, 'vcve-direct-'));
	const requestFile = path.join(directory, 'request.json');
	const responseFile = path.join(directory, 'response.json');
	const started = performance.now();
	try {
		const args = buildDirectHttpMethodArguments(request, database, host, credentials, requestFile, responseFile);
		await writeFile(requestFile, encoded, { encoding: 'ascii', mode: 0o600 });
		await runDirectProcess(executable, args, bin, signal);
		const info = await stat(responseFile).catch(() => undefined);
		if (!info) { throw new Error('Исполнитель не создал результат. Обновите нативный метод 3200176 в выбранной базе. Повторный вызов автоматически не выполнялся.'); }
		if (info.size > maximumResponseBytes) { throw new Error('Результат метода превышает 16 МБ.'); }
		const response = parseDirectHttpMethodResponse(await readFile(responseFile), Math.round(performance.now() - started));
		return { ...response, url: `oe-method:${request.methodName}` };
	} finally {
		// Only remove our exact mkdtemp child, never a workspace or shared temp root.
		if (path.dirname(directory) === bin && path.basename(directory).startsWith('vcve-direct-')) {
			await rm(directory, { recursive: true, force: true });
		}
	}
}

export async function runDirectProcess(executable: string, args: string[], cwd: string, signal?: AbortSignal,
	timeoutMs = 120_000): Promise<void> {
	if (signal?.aborted) { throw new Error('Выполнение отменено до запуска.'); }
	await new Promise<void>((resolve, reject) => {
		const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, stdio: 'ignore' });
		let reason: string | undefined;
		const stop = (message: string) => { reason ??= message; child.kill(); };
		const onAbort = () => stop('Выполнение отменено. Метод мог успеть изменить данные; перед повтором проверьте результат.');
		const timer = setTimeout(() => stop(`Метод не завершился за ${timeoutMs / 1000} секунд. Повтор автоматически не выполнялся; проверьте возможные изменения данных.`), timeoutMs);
		signal?.addEventListener('abort', onAbort, { once: true });
		const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
		child.once('error', error => { cleanup(); reject(error); });
		child.once('close', code => {
			cleanup();
			if (reason) { reject(new Error(reason)); }
			else if (code !== 0) { reject(new Error(`OEExecTask завершился с кодом ${code}. Проверьте свежий журнал клиента. Повтор автоматически не выполнялся.`)); }
			else { resolve(); }
		});
		if (signal?.aborted) { onAbort(); }
	});
}
