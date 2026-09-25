import { bridgeToolResult } from '../bridge';
import { callClientMcpTool, getClientMcpHealth, getClientMcpUrl, listClientMcpTools, stopClientMcpServer, type ClientMcpCallResult, type ClientMcpTool } from './http';
import { withMcpDatabaseSession } from '../database';
const startupAttempts = 10;
const startupDelayMs = 500;

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

async function isClientMcpRunning(): Promise<boolean> {
	try {
		const health = await getClientMcpHealth();
		return health.status.toLocaleLowerCase('en') === 'ok';
	} catch { return false; }
}

export async function startManagedClientMcp(): Promise<{ url: string; alreadyRunning: boolean }> {
	if (await isClientMcpRunning()) { return { url: getClientMcpUrl(), alreadyRunning: true }; }
	await startClientMcpThroughExtension();
	for (let attempt = 0; attempt < startupAttempts; attempt += 1) {
		if (await isClientMcpRunning()) { return { url: getClientMcpUrl(), alreadyRunning: false }; }
		await new Promise(resolve => setTimeout(resolve, startupDelayMs));
	}
	throw new Error('Client MCP was started, but its health endpoint did not become available.');
}

export async function stopManagedClientMcp(): Promise<{ url: string; stopped: true }> {
	await stopClientMcpServer();
	return { url: getClientMcpUrl(), stopped: true };
}

export function listManagedClientMcpTools(): Promise<ClientMcpTool[]> {
	return listClientMcpTools();
}

export function callManagedClientMcpTool(name: string, argumentsValue?: Record<string, unknown>): Promise<ClientMcpCallResult> {
	return callClientMcpTool(name, argumentsValue);
}
