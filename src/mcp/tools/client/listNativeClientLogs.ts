import { listNativeLogs } from '../../../features/native-logs/nativeLogService';
import { workspacePath } from '../../database';
import { z } from '../../schemas';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('list_native_client_logs', {
		description: 'List recent East Express native client error and stack log files from bin/logs (or bin.win64/logs as a fallback). Use this first when diagnosing a native client failure.',
		inputSchema: {
			limit: z.number().int().min(1).max(500).optional().describe('Maximum files to return, default 50'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ limit }: { limit?: number }) => {
		const result = await listNativeLogs(workspacePath, limit ?? 50);
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
			structuredContent: result,
		};
	});
}
