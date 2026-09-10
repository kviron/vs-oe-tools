import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('open_client_entity', {
		description: 'Open an East Express entity in the original client by stable ID. If the client is not running, it is launched with the credentials saved in VS Code settings. Use entityType names accepted by client deep links, for example Метод or Класс.',
		inputSchema: {
			id: z.number().int().positive().describe('Stable East Express object ID'),
			entityType: z.string().min(1).max(100).describe('Entity type for the client link, for example Метод, Класс, or another East Express class name'),
			role: z.enum(['main', 'test']).optional().describe('Database role, default main'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ id, entityType, role }: { id: number; entityType: string; role?: 'main' | 'test' }) =>
		bridgeToolResult({ action: 'open_client_entity', id, entityType, role: role ?? 'main' }));
}
