import { randomBytes } from 'node:crypto';
import { realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { ClientMcpCallResult, ClientMcpHealth } from './http';

type RequestJson = <T>(url: URL, timeoutMs?: number) => Promise<T>;

export const maximumRequestUrlLength = 16_000;
const methodCodeFileProtocol = 'vcve-code-file-v1';
const maximumCodeFileBytes = 2 * 1024 * 1024;

/** Large local method edits stay GET; the native client reads a one-use UTF-8 file. */
export async function callWithMethodCodeFile(
	url: URL,
	toolName: string,
	args: Record<string, unknown>,
	requestJson: RequestJson,
): Promise<ClientMcpCallResult> {
	const member = normalizeMemberId(args.Member);
	if (toolName !== 'class_method_change' || member === undefined
		|| typeof args.Code !== 'string' || Object.keys(args).some(key => key !== 'Member' && key !== 'Code')) {
		throw new Error(`Параметры клиентского MCP слишком велики для HTTP API (${url.href.length} символов).`);
	}
	if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
		throw new Error('Большой исходник можно передать файлом только локальному клиентскому MCP.');
	}
	const payload = JSON.stringify({ protocol: methodCodeFileProtocol, Member: member, Code: args.Code });
	if (Buffer.byteLength(payload, 'utf8') > maximumCodeFileBytes) { throw new Error('Файл исходника метода превышает 2 МБ.'); }
	const healthUrl = new URL(url);
	healthUrl.pathname = healthUrl.pathname.replace(/\/tools\/call$/, '/health');
	healthUrl.search = '';
	const health = await requestJson<ClientMcpHealth>(healthUrl, 3_000);
	if (health.methodCodeFile !== methodCodeFileProtocol || typeof health.tempDirectory !== 'string') {
		throw new Error('Клиентский MCP не поддерживает передачу больших исходников. Обновите метод aiMCP.http_ProcessRequest (12464784).');
	}
	// Never write to an arbitrary directory advertised by an HTTP endpoint.
	const localTemp = await realpath(tmpdir());
	const nativeTemp = await realpath(health.tempDirectory);
	if (!sameLocalPath(localTemp, nativeTemp)) { throw new Error('Временные каталоги расширения и клиентского MCP не совпадают.'); }
	const token = randomBytes(16).toString('hex');
	const file = path.join(localTemp, `vcve-mcp-code-${token}.json`);
	url.searchParams.set('arguments', JSON.stringify({ Member: member }));
	url.searchParams.set('codeToken', token);
	if (url.href.length > maximumRequestUrlLength) { throw new Error('Ссылка на метод слишком велика для HTTP API.'); }
	await writeFile(file, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
	try {
		// A timeout does not prove that the mutation failed. Never retry automatically.
		return await requestJson<ClientMcpCallResult>(url);
	} catch (error) {
		throw new Error(`${error instanceof Error ? error.message : String(error)} Повтор автоматически не выполнялся; перед повтором перечитайте метод.`);
	} finally {
		await rm(file, { force: true }).catch(() => undefined);
	}
}

function normalizeMemberId(value: unknown): string | undefined {
	if (typeof value === 'string') {
		const member = value.trim();
		return member ? member : undefined;
	}
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
		return String(value);
	}
	return undefined;
}

function sameLocalPath(left: string, right: string): boolean {
	return process.platform === 'win32'
		? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
		: left === right;
}
