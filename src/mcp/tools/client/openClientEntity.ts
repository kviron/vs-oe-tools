import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('open_client_entity', {
		description: 'Dispatch the native oe-<database>:/edit/<ID> link through Windows for an already running East Express client. Call get_client_status for the selected role first; call start_client if its client process is absent, then check status again. Windows accepting the URI does not prove that the object opened. The optional entityType is retained for existing callers.',
		inputSchema: {
			id: z.number().int().positive().describe('Stable East Express object ID'),
			entityType: z.string().min(1).max(100).optional().describe('Optional compatibility label; the native edit route resolves the object by ID'),
			role: z.enum(['main', 'test']).optional().describe('Database role, default main'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ id, entityType, role }: { id: number; entityType?: string; role?: 'main' | 'test' }) =>
		bridgeToolResult({ action: 'open_client_entity', id, entityType, role: role ?? 'main' }));
}
