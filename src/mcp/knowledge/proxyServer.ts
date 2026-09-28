import { createInterface } from 'node:readline';
import { UpstreamMcp, safeUpstreamError } from './upstreamMcp';

const url = process.env.VC_VE_KNOWLEDGE_URL;
const token = process.env.VC_VE_KNOWLEDGE_TOKEN;
const collection = process.env.VC_VE_KNOWLEDGE_COLLECTION;
if (!url || !token || !collection) { process.exit(1); }
const upstream = new UpstreamMcp(url, token);

function request(id: number, method: string, params: Record<string, unknown>) {
	return { jsonrpc: '2.0', id, method, params };
}

async function check(): Promise<void> {
	let phase = 'initialize';
	try {
		const initialized = await upstream.send(request(1, 'initialize', {
			protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'vc-ve-tools-knowledge', version: '0.1.0' },
		}));
		if (!initialized?.result || initialized.error) { throw new Error('initialize'); }
		phase = 'tools/list';
		const listed = await upstream.send(request(2, 'tools/list', {}));
		const tools = (listed?.result as { tools?: Array<{ name?: unknown; description?: unknown }> } | undefined)?.tools;
		if (listed?.error || !Array.isArray(tools)) { throw new Error('tools/list'); }
		const catalog = tools.filter(tool => typeof tool?.name === 'string').map(tool => ({
			name: `knowledge__${tool.name}`,
			description: typeof tool.description === 'string' ? tool.description : '',
		}));
		phase = 'collection';
		const config = await upstream.send(request(3, 'tools/call', {
			name: 'weaviate-collections-get-config', arguments: { collection_name: collection },
		}));
		if (config?.error || (config?.result as { isError?: boolean } | undefined)?.isError) {
			process.stdout.write(JSON.stringify({ state: 'invalid', text: 'Коллекция недоступна', collection, toolCount: tools.length, tools: catalog }));
			return;
		}
		const countText = tools.length === 1 ? 'инструмент' : tools.length >= 2 && tools.length <= 4 ? 'инструмента' : 'инструментов';
		process.stdout.write(JSON.stringify({
			state: 'online', text: `На связи · ${tools.length} ${countText}`, collection, toolCount: tools.length,
			tools: catalog,
		}));
	} catch (error) {
		process.stdout.write(JSON.stringify({ state: 'offline', text: `Ошибка ${phase}: ${safeUpstreamError(error)}`, collection }));
	} finally {
		await upstream.close();
	}
}

async function serve(): Promise<void> {
	const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
	let pending = Promise.resolve();
	for await (const line of input) {
		pending = pending.then(async () => {
			let message: Record<string, unknown>;
			try { message = JSON.parse(line) as Record<string, unknown>; }
			catch { return; }
			try {
				const response = await upstream.send(message);
				if (response) { process.stdout.write(`${JSON.stringify(response)}\n`); }
			} catch (error) {
				if ('id' in message) {
					process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: safeUpstreamError(error) } })}\n`);
				}
			}
		});
	}
	await pending;
	await upstream.close();
}

void (process.argv.includes('--check') ? check() : serve()).catch(() => { process.exitCode = 1; });
