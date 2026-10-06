import { commands as featureCommands } from '../../../features/classes/commands';
import { navigationToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('reveal_class', {
		description: 'Reveal an East Express class in the vc-ve-tools Explorer without using mouse or keyboard automation. First resolve the class ID with search_classes.',
		inputSchema: {
			classId: featureCommands.reveal_class.schema.shape.id.describe('Class ID returned by search_classes'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ classId }: { classId: number }) => navigationToolResult('reveal_class', classId));
}
