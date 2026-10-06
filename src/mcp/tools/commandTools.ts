import { commandRegistry } from '../../features/ai/commandRegistry';
import { bridgeToolResult } from '../bridge';
import { loadActiveDatabaseOptions } from '../database';
import type { McpToolServer } from '../toolTypes';

/** Exposes feature-owned tool contracts; no per-command routing or field lists. */
export function registerCommandTools(server: McpToolServer): void {
	for (const [name, command] of Object.entries(commandRegistry)) {
		const tool = command.tool;
		if (!tool) {
			continue;
		}
		server.registerTool(
			name,
			{ description: tool.description, inputSchema: tool.input.shape, annotations: tool.annotations },
			async (input) => {
				const options = await loadActiveDatabaseOptions();
				const payload = tool.prepare(input, {
					expectedDatabase: options.database,
					expectedHost: options.host,
					expectedPort: options.port,
				});
				return bridgeToolResult({ ...payload, action: name }, tool.timeoutMs);
			},
		);
	}
}
