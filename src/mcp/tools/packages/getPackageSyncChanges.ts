import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_package_sync_changes', {
		description: 'Return the changed-file/object list shown by East Express package synchronization. Includes IDs, state, revision, MD5, user, date and resolved paths, but never file contents.',
		inputSchema: {
			query: z.string().optional().describe('Optional filter by object ID, name, state, package or path'),
			offset: z.number().int().min(0).optional().describe('Zero-based result offset, default 0'),
			limit: z.number().int().min(1).max(500).optional().describe('Maximum entries, default 100'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ query, offset, limit }: { query?: string; offset?: number; limit?: number }) => bridgeToolResult({
		action: 'get_package_sync_changes', query, offset: offset ?? 0, limit: limit ?? 100,
	}));
}
