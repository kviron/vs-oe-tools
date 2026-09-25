import { z } from '../../schemas';
import { logToolResult } from '../../extensionLogs';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_recent_extension_errors', {
		description: 'Read recent vc-ve-tools errors. Use this first when diagnosing an extension or database failure.',
		inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('Maximum errors to return, default 30') },
		annotations: { readOnlyHint: true },
	}, async ({ limit }: { limit?: number }) => logToolResult('error', limit ?? 30));
}
