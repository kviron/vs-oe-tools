import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadKnowledgeMcpConnection } from './connectionSource';

export interface KnowledgeMcpStatus {
	state: 'missing' | 'invalid' | 'offline' | 'online';
	text: string;
	collection?: string;
	toolCount?: number;
	tools?: Array<{ name: string; description: string }>;
}

/** Probes through the same child process used for chat, without exposing credentials to the UI. */
export async function checkKnowledgeMcpStatus(extensionPath: string, workspacePath?: string, configuredFile?: string): Promise<KnowledgeMcpStatus> {
	let connection;
	try {
		connection = await loadKnowledgeMcpConnection(extensionPath, workspacePath, configuredFile);
	} catch {
		return { state: 'invalid', text: 'Ошибка чтения или формата .env' };
	}
	if (!connection) { return { state: 'missing', text: 'Нет url, token или collection в .env' }; }
	const { url, token, collection } = connection;
	return new Promise<KnowledgeMcpStatus>(resolve => {
		const child = spawn(process.execPath, [path.join(extensionPath, 'dist', 'knowledge-mcp-proxy.js'), '--check'], {
			windowsHide: true,
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: '1',
				VC_VE_KNOWLEDGE_URL: url,
				VC_VE_KNOWLEDGE_TOKEN: token,
				VC_VE_KNOWLEDGE_COLLECTION: collection,
			},
		});
		let output = '';
		let settled = false;
		const finish = (value: KnowledgeMcpStatus) => {
			if (settled) { return; }
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(() => {
			child.kill();
			finish({ state: 'offline', text: 'Проверка MCP превысила время ожидания', collection });
		}, 20_000);
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => { output += chunk; });
		child.on('error', () => finish({ state: 'offline', text: 'Не удалось запустить MCP-мост', collection }));
		child.on('close', () => {
			try { finish(JSON.parse(output) as KnowledgeMcpStatus); }
			catch { finish({ state: 'offline', text: 'MCP-мост не вернул результат', collection }); }
		});
	});
}
