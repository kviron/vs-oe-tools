import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import { loadActiveDatabaseOptions } from '../../database';
import { callManagedClientMcpTool, listManagedClientMcpTools, startManagedClientMcp, stopManagedClientMcp } from '../../client/lifecycle';
import { getClientMcpHealth } from '../../client/http';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_method_source', {
		description: 'Replace complete method source through native client MCP class_method_change when available, otherwise use the extension save pipeline. Re-read the native change and always compile before returning. A saved method with passed=false is incomplete. Preserve the anonymous declaration wrapper without the card name.',
		inputSchema: {
			methodId: z.number().int().positive().describe('Existing method ID returned by search_methods'),
			code: z.string().max(1_500_000).describe('Complete replacement source including the anonymous declaration wrapper, without the method card name'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async ({ methodId, code }: { methodId: number; code: string }) => {
		const options = await loadActiveDatabaseOptions();
		let nativeAvailable = false;
		let started = false;
		try {
			started = true;
			await startManagedClientMcp();
			const health = await getClientMcpHealth();
			if (health.database?.toLowerCase() !== options.database.toLowerCase()) {
				throw new Error(`Клиентский MCP подключён к ${health.database ?? '<неизвестно>'}, ожидалась ${options.database}.`);
			}
			const names = new Set((await listManagedClientMcpTools()).map(item => item.name));
			nativeAvailable = names.has('class_member_get') && names.has('class_method_change');
			if (nativeAvailable) {
				const before = parseNative(await callManagedClientMcpTool('class_member_get', { Members: [String(methodId)] }));
				if (nativeCode(before, methodId) === undefined) { throw new Error(`Метод ${methodId} не найден в клиентском MCP.`); }
				const changed = parseNative(await callManagedClientMcpTool('class_method_change', { Member: String(methodId), Code: code }));
				if (Number(changed.id) !== methodId) { throw new Error(`Клиентский MCP изменил неожиданный метод ${changed.id}.`); }
				const after = parseNative(await callManagedClientMcpTool('class_member_get', { Members: [String(methodId)] }));
				const actualCode = nativeCode(after, methodId);
				if (actualCode === undefined || normalize(actualCode) !== normalize(code)) {
					throw new Error(`Контрольное чтение метода ${methodId} не совпало с записанным кодом.`);
				}
				const compiled = await bridgeToolResult({ action: 'compile_method', id: methodId,
					expectedDatabase: options.database, expectedHost: options.host, expectedPort: options.port });
				if (compiled.isError) { return compiled; }
				const compilation = (compiled.structuredContent as { result?: { passed?: boolean } } | undefined)?.result;
				const outcome = { methodId, database: options.database, path: 'client-mcp', compilation };
				return { isError: compilation?.passed !== true,
					content: [{ type: 'text' as const, text: JSON.stringify(outcome, null, 2) }], structuredContent: outcome };
			}
		} catch (error) {
			return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
		} finally {
			if (started) { await stopManagedClientMcp().catch(() => undefined); }
		}
		const result = await bridgeToolResult({ action: 'update_method_source', id: methodId, code,
			expectedDatabase: options.database, expectedHost: options.host, expectedPort: options.port });
		const compilation = (result.structuredContent as { compilation?: { passed?: boolean } } | undefined)?.compilation;
		return { ...result, isError: result.isError || compilation?.passed === false };
	});
}

function parseNative(result: { content: Array<{ text: string }>; isError?: boolean }): Record<string, unknown> {
	const raw = result.content.map(item => item.text).join('\n');
	if (result.isError) { throw new Error(raw || 'Клиентский MCP вернул ошибку.'); }
	try { return JSON.parse(raw) as Record<string, unknown>; }
	catch { throw new Error(`Некорректный ответ клиентского MCP: ${raw.slice(0, 500)}`); }
}

function nativeCode(response: Record<string, unknown>, methodId: number): string | undefined {
	const items = response.items as Array<{ item?: { id?: number; code?: string } }> | undefined;
	const item = items?.[0]?.item;
	return Number(item?.id) === methodId ? item?.code : undefined;
}

function normalize(value: string | undefined): string {
	return value?.replace(/\r\n/g, '\n').trim() ?? '';
}
