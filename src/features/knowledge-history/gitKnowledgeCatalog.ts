import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface KnowledgeArticle {
	id: string;
	title: string;
	excerpt: string;
	path: string;
}

export async function findKnowledgeRoot(configuredPath: string, workspacePath?: string): Promise<string | undefined> {
	const candidates = configuredPath.trim() ? [configuredPath] : [
		workspacePath ? path.join(path.dirname(workspacePath), 've-internal-docs') : '',
		process.platform === 'win32' ? 'C:\\dev\\ve-internal-docs' : '',
	].filter(Boolean);
	for (const candidate of candidates) {
		const root = path.resolve(candidate);
		try { await access(path.join(root, 'docs', 'knowledge')); return root; }
		catch { /* Try the next candidate. */ }
	}
	return undefined;
}

export async function listKnowledgeArticles(root: string, search = '', limit = 200): Promise<KnowledgeArticle[]> {
	const base = path.join(root, 'docs', 'knowledge');
	const needle = search.trim().toLocaleLowerCase('ru');
	const result: KnowledgeArticle[] = [];
	async function visit(directory: string): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) { await visit(absolute); continue; }
			if (!entry.isFile() || !entry.name.endsWith('.md')) { continue; }
			const content = await readFile(absolute, 'utf8');
			const id = path.relative(base, absolute).replaceAll('\\', '/');
			if (needle && !`${id}\n${content}`.toLocaleLowerCase('ru').includes(needle)) { continue; }
			const title = /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? entry.name;
			const excerpt = content.replace(/^#\s+.+$/m, '').trim().slice(0, 500);
			result.push({ id, title, excerpt, path: absolute });
		}
	}
	await visit(base);
	return result.sort((left, right) => left.title.localeCompare(right.title, 'ru')).slice(0, limit);
}
