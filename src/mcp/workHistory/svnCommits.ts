import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface SvnTaskCommit {
	repositoryRoot: string;
	revision: number;
	author: string;
	committedAt: string;
	message: string;
	paths: string[];
}

function svn(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn('svn', [...args, '--non-interactive'], { windowsHide: true });
		let stdout = '';
		let stderr = '';
		const timeout = setTimeout(() => child.kill(), 90000);
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
			if (stdout.length > 20_000_000) { child.kill(); }
		});
		child.stderr.on('data', (chunk: string) => { stderr += chunk; });
		child.on('error', error => { clearTimeout(timeout); reject(error); });
		child.on('close', code => {
			clearTimeout(timeout);
			if (code !== 0) { reject(new Error(`svn ${args[0]} failed: ${stderr.trim() || `exit ${code}`}`)); }
			else { resolve(stdout); }
		});
	});
}

function decode(value: string): string {
	return value.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric: string | undefined, named: string | undefined) => {
		if (numeric) { return String.fromCodePoint(numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10)); }
		return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[named ?? ''] ?? match;
	});
}

function field(xml: string, name: string): string {
	return decode(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '');
}

/** A merge summary can mention dozens of tasks; only the leading task ID owns the commit. */
export function isTaskSvnCommitMessage(message: string, taskNumber: string): boolean {
	if (!/^\d+$/.test(taskNumber)) { return false; }
	const firstLine = message.trimStart().split(/\r?\n/, 1)[0] ?? '';
	return new RegExp(`^#?${taskNumber}(?!\\d)(?=\\s|[-:–—.]|$)`).test(firstLine);
}

export function parseTaskSvnLog(xml: string, repositoryRoot: string, taskNumber: string): SvnTaskCommit[] {
	const commits: SvnTaskCommit[] = [];
	for (const match of xml.matchAll(/<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g)) {
		const message = field(match[2], 'msg');
		if (!isTaskSvnCommitMessage(message, taskNumber)) { continue; }
		commits.push({ repositoryRoot, revision: Number(match[1]), author: field(match[2], 'author'),
			committedAt: field(match[2], 'date'), message,
			paths: Array.from(match[2].matchAll(/<path(?:\s[^>]*)?>([\s\S]*?)<\/path>/g), item => decode(item[1])) });
	}
	return commits;
}

export async function findTaskSvnCommits(workspace: string, taskNumber: string): Promise<{ roots: string[]; commits: SvnTaskCommit[] }> {
	if (!/^\d+$/.test(taskNumber)) { throw new Error('SVN search requires a numeric task number.'); }
	const directories = [workspace];
	if (existsSync(workspace)) {
		for (const entry of readdirSync(workspace, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.name.startsWith('.')) { directories.push(path.join(workspace, entry.name)); }
		}
	}
	const roots = new Set<string>();
	for (const directory of directories) {
		if (!existsSync(path.join(directory, '.svn'))) { continue; }
		roots.add((await svn(['info', '--show-item', 'repos-root-url', directory])).trim());
	}
	if (!roots.size) { throw new Error(`В ${workspace} и его непосредственных подпапках не найдена рабочая копия SVN.`); }
	const commits: SvnTaskCommit[] = [];
	for (const root of roots) {
		const xml = await svn(['log', '--xml', '--search', taskNumber, root]);
		for (const commit of parseTaskSvnLog(xml, root, taskNumber)) {
			const detail = await svn(['log', '--xml', '-v', '-r', String(commit.revision), root]);
			commit.paths = parseTaskSvnLog(detail, root, taskNumber)[0]?.paths ?? [];
			commits.push(commit);
		}
	}
	return { roots: [...roots], commits };
}
