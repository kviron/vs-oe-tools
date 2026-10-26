import { z } from 'zod';
// Match the repository's CommonJS SDK boundary (Node-only TypeScript lib).
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const taskSchema = z.object({
	id: z.number().int().positive(), number: z.number().int().nonnegative(),
	subject: z.string(), date: z.string(), content: z.string().optional(),
});
export type ProductionMcpTask = z.infer<typeof taskSchema>;
const listSchema = z.object({ count: z.number().int().nonnegative(), item: z.array(taskSchema) });
const viewSchema = z.object({ items: z.array(z.object({
	request: z.string(), status: z.enum(['ok', 'not_found', 'error']), item: taskSchema.optional(),
})) });

class ProductionMcpResponseError extends Error {}

export function describeProductionMcpFailure(error: unknown, stage: 'connect' | 'read'): string {
	const prefix = stage === 'connect' ? 'Не удалось подключиться к публичному MCP.' : 'Не удалось прочитать задачи через публичный MCP.';
	if (error instanceof ProductionMcpResponseError) { return `${prefix} ${error.message}`; }
	const details = error as { code?: unknown; name?: unknown; cause?: { code?: unknown } } | undefined;
	const code = details?.code;
	if (typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599) {
		const advice = code === 401 || code === 403
			? 'Проверьте токен и права доступа.'
			: code >= 500 ? 'Сервер MCP вернул ошибку; проверьте его журнал или повторите позже.' : 'Проверьте адрес и совместимость сервера MCP.';
		return `${prefix} HTTP ${code}. ${advice}`;
	}
	if (code === -32601) { return `${prefix} Сервер не поддерживает запрошенный MCP-инструмент (код -32601).`; }
	if (code === -32602) { return `${prefix} Сервер отклонил параметры MCP-запроса (код -32602).`; }
	if (code === -32001 || details?.name === 'TimeoutError' || details?.name === 'AbortError') {
		return `${prefix} Истекло время ожидания ответа.`;
	}
	const networkCode = details?.cause?.code ?? code;
	if (networkCode === 'ENOTFOUND' || networkCode === 'EAI_AGAIN') { return `${prefix} Не удалось разрешить имя mcp.oe-it.ru (DNS).`; }
	if (networkCode === 'ECONNREFUSED' || networkCode === 'ECONNRESET' || networkCode === 'ETIMEDOUT') {
		return `${prefix} Сетевое соединение отклонено, разорвано или не отвечает.`;
	}
	return `${prefix} Проверьте токен и доступность https://mcp.oe-it.ru/proxy/.`;
}

export function parseProductionMcpResult(result: unknown, token?: string): unknown {
	const parsed = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).safeParse(result);
	if (!parsed.success) { throw new ProductionMcpResponseError('Публичный MCP вернул некорректный формат ответа.'); }
	const response = parsed.data;
	const text = response.content.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
	if (response.isError) {
		let reason = text;
		if (token) {
			for (const secret of new Set([token, encodeURIComponent(token)])) {
				reason = reason.split(secret).join('[скрыто]');
			}
		}
		reason = reason.replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [скрыто]')
			.replace(/((?:authorization|token|password|api[_-]?key)\s*["']?\s*[:=]\s*["']?)[^\s"',;}<>]+/gi, '$1[скрыто]')
			.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 1500);
		throw new ProductionMcpResponseError(`Публичный MCP не смог выполнить чтение задачи (isError=true).${reason ? ` Ответ сервера: ${reason}` : ''}`);
	}
	try { return JSON.parse(text) as unknown; }
	catch { throw new ProductionMcpResponseError('Публичный MCP вернул некорректный JSON.'); }
}

/** Owns the two supported read contracts, transport lifetime and secret-safe errors. */
export class ProductionMcpClient {
	constructor(private readonly token: string) {}
	private async call(name: 'oe_ur_list' | 'oe_ur_view', args: Record<string, unknown>): Promise<unknown> {
		const client = new Client({ name: 'vc-ve-tools-production', version: '0.12.0' });
		let stage: 'connect' | 'read' = 'connect';
		try {
			await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.oe-it.ru/proxy/'), {
				requestInit: { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(60_000) },
			}));
			stage = 'read';
			return parseProductionMcpResult(await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 }), this.token);
		} catch (error) {
			throw new Error(describeProductionMcpFailure(error, stage));
		} finally { await client.close().catch(() => undefined); }
	}
	async list(args: { numbers?: string[]; subject_fragments?: string[]; content_fragments?: string[]; folder_uri?: string; limit: number }): Promise<ProductionMcpTask[]> {
		return listSchema.parse(await this.call('oe_ur_list', args)).item;
	}
	async view(ids: number[]): Promise<ProductionMcpTask[]> {
		if (!ids.length) { return []; }
		const response = viewSchema.parse(await this.call('oe_ur_view', { Uri: ids.map(String) }));
		return response.items.flatMap(entry => {
			if (entry.status === 'not_found') { return []; }
			if (entry.status !== 'ok' || !entry.item || entry.item.content === undefined) { throw new Error('Публичный MCP не вернул описание задачи.'); }
			return [entry.item];
		});
	}
}
