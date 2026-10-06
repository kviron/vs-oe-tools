import { commands as featureCommands } from '../../../features/methods/commands';
import { navigationToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('open_method', {
		description: 'Open an East Express method in the VS Code virtual editor without cursor automation. First resolve the method ID with search_methods.',
		inputSchema: {
			methodId: featureCommands.open_method.schema.shape.id.describe('Method ID returned by search_methods'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ methodId }: { methodId: number }) => navigationToolResult('open_method', methodId));
}
