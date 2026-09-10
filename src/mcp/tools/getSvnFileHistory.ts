import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_svn_file_history', {
		description: 'Read SVN history for a file inside the currently open East Express workspace using the extension SVN integration.',
		inputSchema: {
			filePath: z.string().min(1).describe('Workspace-relative path or absolute path inside the open workspace'),
			limit: z.number().int().min(1).max(500).optional().describe('Maximum revisions, default 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ filePath, limit }: { filePath: string; limit?: number }) => bridgeToolResult({ action: 'get_svn_file_history', filePath, limit: limit ?? 100 }));
}
