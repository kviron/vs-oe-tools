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

export function parseProductionMcpResult(result: unknown): unknown {
	const response = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).parse(result);
	if (response.isError) { throw new Error('Публичный MCP не смог выполнить чтение задачи.'); }
	const text = response.content.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
	try { return JSON.parse(text) as unknown; }
	catch { throw new Error('Публичный MCP вернул некорректный JSON.'); }
}

/** Owns the two supported read contracts, transport lifetime and secret-safe errors. */
export class ProductionMcpClient {
	constructor(private readonly token: string) {}
	private async call(name: 'oe_ur_list' | 'oe_ur_view', args: Record<string, unknown>): Promise<unknown> {
		const client = new Client({ name: 'vc-ve-tools-production', version: '0.11.0' });
		try {
			await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.oe-it.ru/proxy/'), {
				requestInit: { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(60_000) },
			}));
			return parseProductionMcpResult(await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 }));
		} catch {
			throw new Error('Не удалось прочитать продуктовые задачи через публичный MCP. Проверьте токен и доступность https://mcp.oe-it.ru/proxy/.');
		} finally { await client.close().catch(() => undefined); }
	}
	async list(args: { numbers?: string[]; subject_fragments?: string[]; content_fragments?: string[]; limit: number }): Promise<ProductionMcpTask[]> {
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
