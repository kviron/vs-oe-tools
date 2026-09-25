import { readNativeLog } from '../../../features/native-logs/nativeLogService';
import { workspacePath } from '../../database';
import { z } from '../../schemas';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('read_native_client_log', {
		description: 'Read a bounded, paginated excerpt from an East Express native client log returned by list_native_client_logs. Windows-1251 and UTF-16 logs are decoded automatically and never modified.',
		inputSchema: {
			fileName: z.string().min(1).describe('File name returned by list_native_client_logs, without a directory path'),
			startLine: z.number().int().min(1).optional().describe('First line to return, one-based, default 1'),
			maxLines: z.number().int().min(1).max(2000).optional().describe('Maximum lines to return, default 1000'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ fileName, startLine, maxLines }: { fileName: string; startLine?: number; maxLines?: number }) => {
		const result = await readNativeLog(workspacePath, fileName, startLine, maxLines);
		return {
			content: [{ type: 'text' as const, text: [
				`${result.path} · строки ${result.startLine}-${result.endLine} из ${result.totalLines}`,
				result.content,
			].join('\n\n') }],
			structuredContent: { ...result },
		};
	});
}
