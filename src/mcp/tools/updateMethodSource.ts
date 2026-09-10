import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_method_source', {
		description: 'Replace the complete source of an existing East Express method through the VS Code extension save pipeline. Preserve the anonymous proc/procedure/func/function wrapper returned by get_method_source, but do not add the method card name. The save updates signature metadata when the declaration changes, preserves Windows-1251, writes native-style audit history, and commits atomically.',
		inputSchema: {
			methodId: z.number().int().positive().describe('Existing method ID returned by search_methods'),
			code: z.string().max(1_500_000).describe('Complete replacement source including the anonymous declaration wrapper, without the method card name'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async ({ methodId, code }: { methodId: number; code: string }) => bridgeToolResult({ action: 'update_method_source', id: methodId, code }));
}
