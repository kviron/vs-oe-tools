import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import { loadActiveDatabaseOptions } from '../../database';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('create_local_tool_class', {
		description: 'Create a local East Express BaseUtils class with a non-developer ID and no package synchronization. Verify get_active_database first. Returns the new class ID and database. Restart the East Express client before using the class because its class cache may be stale.',
		inputSchema: { name: z.string().min(1).max(100).describe('Unique East Express class identifier') },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ name }: { name: string }) => {
		const options = await loadActiveDatabaseOptions();
		return bridgeToolResult({ action: 'create_local_tool_class', name,
			expectedDatabase: options.database, expectedHost: options.host, expectedPort: options.port });
	});
}
