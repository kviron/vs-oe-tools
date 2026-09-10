import { z } from '../schemas';
import { navigationToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('open_class', {
		description: 'Reveal an East Express class in the vc-ve-tools Explorer and open its class card in VS Code without cursor automation. First resolve the class ID with search_classes.',
		inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ classId }: { classId: number }) => navigationToolResult('open_class', classId));
}
