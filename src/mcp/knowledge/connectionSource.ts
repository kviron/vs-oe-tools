import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface KnowledgeMcpConnection {
	url: string;
	token: string;
	collection: string;
}

/** Temporary connection source. A client MCP source can implement this contract later. */
export async function loadKnowledgeMcpConnection(extensionPath: string, workspacePath?: string, configuredFile?: string): Promise<KnowledgeMcpConnection | undefined> {
	const candidates = configuredFile?.trim()
		? [configuredFile.trim()]
		: [extensionPath, workspacePath].filter((value): value is string => Boolean(value)).map(directory => path.join(directory, '.env'));
	for (const filePath of candidates) {
		let content: string;
		try {
			content = await readFile(filePath, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') { continue; }
			throw error;
		}
		const connection = parseKnowledgeMcpConnection(content);
		if (connection) { return connection; }
	}
	return undefined;
}

export function parseKnowledgeMcpConnection(content: string): KnowledgeMcpConnection | undefined {
	const values = new Map<string, string>();
	for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const match = /^\s*(url|token|collection)\s*:\s*(.*?)\s*$/i.exec(line);
		if (match) { values.set(match[1].toLowerCase(), match[2]); }
	}
	const url = values.get('url');
	const token = values.get('token');
	const collection = values.get('collection');
	if (!url || !token || !collection) { return undefined; }
	const parsedUrl = new URL(url);
	if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
		throw new Error('Адрес MCP базы знаний должен использовать HTTP или HTTPS.');
	}
	if (/\r|\n/.test(token) || /\r|\n/.test(collection)) {
		throw new Error('Некорректные параметры MCP базы знаний.');
	}
	return { url: parsedUrl.toString(), token, collection };
}
