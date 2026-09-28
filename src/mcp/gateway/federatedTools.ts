import path from 'node:path';
import { readOptionalArgument } from '../arguments';
import { startManagedClientMcp, listManagedClientMcpTools, callManagedClientMcpTool, stopManagedClientMcp } from '../client/lifecycle';
import { loadKnowledgeMcpConnection, type KnowledgeMcpConnection } from '../knowledge/connectionSource';
import { UpstreamMcp, safeUpstreamError } from '../knowledge/upstreamMcp';
import { z } from '../schemas';

interface ExternalTool { name: string; description?: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> }
interface GatewayServer {
	registerTool(name: string, config: { description: string; inputSchema: unknown; annotations?: Record<string, unknown> }, handler: (args: Record<string, unknown>) => Promise<unknown>): unknown;
	server: { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<unknown> | unknown>; setRequestHandler(schema: unknown, handler: (request: unknown, extra: unknown) => Promise<unknown> | unknown): void };
}

const { ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const toolSchemas = new Map<string, Record<string, unknown>>();
let clientQueue = Promise.resolve();

function withClient<T>(work: () => Promise<T>): Promise<T> {
	const next = clientQueue.then(work, work);
	clientQueue = next.then(() => undefined, () => undefined);
	return next;
}

async function clientSession<T>(work: () => Promise<T>): Promise<T> {
	const started = await startManagedClientMcp();
	try { return await work(); }
	finally { if (!started.alreadyRunning) { await stopManagedClientMcp(); } }
}

async function knowledgeSession<T>(connection: KnowledgeMcpConnection, work: (upstream: UpstreamMcp) => Promise<T>): Promise<T> {
	const upstream = new UpstreamMcp(connection.url, connection.token);
	try {
		const initialized = await upstream.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
			protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'vc-ve-tools', version: '0.1.0' },
		} });
		if (!initialized?.result || initialized.error) { throw new Error('Knowledge MCP initialize failed'); }
		return await work(upstream);
	} finally { await upstream.close(); }
}

function errorResult(error: unknown) {
	return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
}

function registerExternal(server: GatewayServer, prefix: string, tool: ExternalTool, call: (args: Record<string, unknown>) => Promise<unknown>): void {
	const name = `${prefix}__${tool.name}`;
	if (toolSchemas.has(name)) { return; }
	toolSchemas.set(name, tool.inputSchema);
	server.registerTool(name, {
		description: `[${prefix === 'client' ? 'East Express client' : 'Knowledge base'}] ${tool.description ?? tool.name}`,
		inputSchema: z.object({}).passthrough(),
		annotations: tool.annotations,
	}, async args => {
		try { return await call(args); }
		catch (error) { return errorResult(error); }
	});
}

/** Adds externally discovered tools to the public MCP server while keeping their original JSON schemas. */
export async function registerFederatedTools(server: GatewayServer): Promise<void> {
	const handler = server.server._requestHandlers.get('tools/list');
	if (!handler) { throw new Error('Extension MCP tools must be registered first.'); }
	server.server.setRequestHandler(ListToolsRequestSchema, async (request: unknown, extra: unknown) => {
		const result = await handler(request, extra) as { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> };
		return { ...result, tools: result.tools.map(tool => toolSchemas.has(tool.name)
			? { ...tool, inputSchema: toolSchemas.get(tool.name) }
			: tool) };
	});

	const workspace = readOptionalArgument('--workspace');
	const configuredFile = readOptionalArgument('--knowledge-env-file');
	const connection = await loadKnowledgeMcpConnection(path.dirname(path.dirname(process.argv[1])), workspace, configuredFile).catch(() => undefined);
	const discoveries: Promise<void>[] = [];
	if (workspace) { discoveries.push(withClient(async () => clientSession(async () => {
		for (const tool of await listManagedClientMcpTools()) {
			registerExternal(server, 'client', tool, args => withClient(async () => clientSession(() => callManagedClientMcpTool(tool.name, args))));
		}
	})).catch(error => { console.error(`Client MCP catalog unavailable: ${error instanceof Error ? error.message : String(error)}`); })); }
	if (connection) {
		discoveries.push(knowledgeSession(connection, async upstream => {
			const response = await upstream.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
			const tools = (response?.result as { tools?: ExternalTool[] } | undefined)?.tools;
			if (!Array.isArray(tools)) { throw new Error('Knowledge MCP tools/list failed'); }
			for (const tool of tools) {
				registerExternal(server, 'knowledge', tool, async args => knowledgeSession(connection, async session => {
					const result = await session.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
						name: tool.name, arguments: { ...args, collection_name: args.collection_name ?? connection.collection },
					} });
					if (result?.error) { return { content: [{ type: 'text', text: JSON.stringify(result.error) }], isError: true }; }
					return result?.result ?? { content: [{ type: 'text', text: 'Empty knowledge MCP response' }], isError: true };
				}));
			}
		} ).catch(error => { console.error(`Knowledge MCP catalog unavailable: ${safeUpstreamError(error)}`); }));
	}
	await Promise.all(discoveries);
}
