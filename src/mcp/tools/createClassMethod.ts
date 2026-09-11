import { z } from '../schemas';
import { loadActiveDatabaseOptions } from '../databaseSession';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('create_class_method', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Create an interpreted East Express method in an existing class through the controlled VS Code database transaction. It allocates an ID from DeveloperIDs, rejects duplicate names, derives Signature from Code, writes Methods/Abstract and ChangeType=3 audit data atomically, inherits the owner SysFile, updates ClassVersion and package change state, then opens the source.',
		inputSchema: {
			ownerClassId: z.number().int().positive().describe('Owning class ID'),
			name: z.string().min(1).max(250).regex(/^[\p{L}_][\p{L}\p{N}_]*$/u).describe('Method card name without a proc/function declaration'),
			visibilityId: z.number().int().positive().optional().describe('Visibility enum ID, default 12450286 (Public)'),
			signature: z.string().max(4000).optional().describe('Legacy compatibility field; the stored signature is derived from the anonymous declaration in code'),
			code: z.string().max(1_500_000).optional().describe('Complete anonymous proc/procedure/func/function source; defaults to an empty proc() block'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async (input: { ownerClassId: number; name: string; visibilityId?: number; signature?: string; code?: string }) => {
		const options = await loadActiveDatabaseOptions();
		return bridgeToolResult({
			action: 'create_class_method',
			database: options.database,
			host: options.host,
			draft: {
			ownerClassId: input.ownerClassId,
			name: input.name,
			visibilityId: input.visibilityId ?? 12450286,
			methodType: 3,
			methodKind: 0,
			signature: input.signature ?? '',
			code: input.code ?? 'proc()\r\nbegin\r\n\r\nend;\r\n',
			},
		});
	});
}
