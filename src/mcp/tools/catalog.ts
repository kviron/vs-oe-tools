import type { McpToolServer } from '../toolTypes';
import { registerTools } from './registration';
import { deprecatedMcpToolNames, russianMcpToolDescriptions } from './toolPresentation';

export interface RegisteredMcpToolCatalogItem {
	name: string;
	description: string;
	deprecated: boolean;
}

let registeredToolCatalog: RegisteredMcpToolCatalogItem[] | undefined;

/** Build the public tool catalog from the same registrations used by the MCP server. */
export function getRegisteredToolCatalog(): RegisteredMcpToolCatalogItem[] {
	if (registeredToolCatalog) { return registeredToolCatalog; }
	const tools: RegisteredMcpToolCatalogItem[] = [];
	const catalogServer: McpToolServer = {
		registerTool: (name, config) => {
			tools.push({
				name,
				description: russianMcpToolDescriptions[name] ?? config.description.trim(),
				deprecated: deprecatedMcpToolNames.has(name),
			});
		},
	};
	registerTools(catalogServer);
	registeredToolCatalog = tools;
	return registeredToolCatalog;
}
