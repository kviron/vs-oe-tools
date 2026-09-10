import { bridgeToolResult } from './bridge';
import { callClientMcpTool, getClientMcpHealth, getClientMcpUrl, listClientMcpTools, stopClientMcpServer, type ClientMcpCallResult, type ClientMcpTool } from './clientMcpHttp';
import { withMcpDatabaseSession } from './databaseSession';
import { ClientMcpLifecycleManager } from './clientMcpLifecycleManager';

async function startClientMcpThroughExtension(): Promise<void> {
	const result = await withMcpDatabaseSession(async ({ options }) => bridgeToolResult({
		action: 'start_client_mcp',
		database: options.database,
		host: options.host,
	}));
	if (result.isError) {
		throw new Error(result.content[0]?.text ?? 'VS Code extension could not start the client MCP.');
	}
}

const lifecycle = new ClientMcpLifecycleManager({
	getHealth: async () => {
		const health = await getClientMcpHealth();
		if (health.status.toLocaleLowerCase('en') !== 'ok') {
			throw new Error(`Client MCP health status is ${health.status}.`);
		}
	},
	start: startClientMcpThroughExtension,
	stop: () => stopClientMcpServer(),
	setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimer: timer => clearTimeout(timer),
});

export function listManagedClientMcpTools(): Promise<ClientMcpTool[]> {
	return lifecycle.run(() => listClientMcpTools());
}

export function callManagedClientMcpTool(name: string, argumentsValue?: Record<string, unknown>): Promise<ClientMcpCallResult> {
	return lifecycle.run(() => callClientMcpTool(name, argumentsValue));
}
