import { z } from '../schemas';
import { logToolResult } from '../extensionLogs';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_extension_logs', {
		description: 'Read recent structured vc-ve-tools diagnostic events.',
		inputSchema: {
			level: z.enum(['info', 'warning', 'error']).optional(),
			limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return, default 50'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ level, limit }: { level?: 'info' | 'warning' | 'error'; limit?: number }) => logToolResult(level, limit ?? 50));
}
