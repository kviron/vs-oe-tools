import { dispatchClientCommand, startGuiClientMcp } from '../../client/guiCommands';
import { loadActiveDatabaseOptions } from '../../database';
import { z } from '../../schemas';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('execute_client_command', {
		description: 'Отправить зарегистрированную в ClientCommands команду открытому FME активной базы. Требуется ровно один подходящий клиент. Результат подтверждает отправку URI, а не выполнение команды. Параметры берутся из нативного реестра, не из URL.',
		inputSchema: { command: z.string().regex(/^[a-z][a-z0-9._-]{0,99}$/) },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async ({ command }: { command: string }) => {
		try {
			const target = await loadActiveDatabaseOptions();
			const result = await dispatchClientCommand(target.database, target.host, command);
			return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: { ...result } };
		} catch (error) { return { content: [{ type: 'text', text: String(error) }], isError: true }; }
	});
	server.registerTool('start_gui_client_mcp', {
		description: 'Запустить MCP в открытом FME через зарегистрированную команду mcp.start. Проверить активную базу, режим GUI и PID процесса через /health. Сохранить этот сервер между вызовами инструментов.',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async () => {
		try {
			const target = await loadActiveDatabaseOptions();
			const result = await startGuiClientMcp(target.database, target.host);
			return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: { ...result } };
		} catch (error) { return { content: [{ type: 'text', text: String(error) }], isError: true }; }
	});
}
