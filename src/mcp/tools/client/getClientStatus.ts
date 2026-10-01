import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_client_status', {
		description: 'Inspect the configured database role without launching anything. Reports whether an FME process names that database in its startup arguments and whether the local East Express TCP server port accepts connections. Neither proves that a login or object opening succeeded.',
		inputSchema: { role: z.enum(['main', 'test']).describe('Database role to inspect') },
		annotations: { readOnlyHint: true },
	}, async ({ role }: { role: 'main' | 'test' }) => bridgeToolResult({ action: 'get_client_status', role }));
}
