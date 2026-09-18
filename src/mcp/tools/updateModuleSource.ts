import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('update_module_source', {
		description: 'Replace the complete source code of an existing East Express module object, including report code, through the same transactional Windows-1251 save pipeline used by the VS Code editor. Read the complete current source with get_module_source first. The save writes native-style audit history and marks the owning package file as changed.',
		inputSchema: {
			moduleId: z.number().int().positive().describe('Existing object ID whose meta-class is Модуль (ClassID=33)'),
			code: z.string().max(1_500_000).describe('Complete replacement module source'),
			expectedDatabase: z.string().min(1).describe('Exact database returned by get_active_database'),
			expectedHost: z.string().min(1).describe('Exact database host returned by get_active_database'),
			expectedPort: z.number().int().min(1).max(65535).describe('Exact database port returned by get_active_database'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async ({ moduleId, code, expectedDatabase, expectedHost, expectedPort }: {
		moduleId: number; code: string; expectedDatabase: string; expectedHost: string; expectedPort: number;
	}) => bridgeToolResult({ action: 'update_module_source', id: moduleId, code, expectedDatabase, expectedHost, expectedPort }));
}
