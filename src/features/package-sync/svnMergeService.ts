import { execFile } from 'node:child_process';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as iconv from 'iconv-lite';
import type { SvnConflictContent, SvnMergeFile, SvnMergeFileStatus, SvnMergeResult } from './models';

const execFileAsync = promisify(execFile);

export async function mergePackageRevision(workspacePath: string, branch: string, revision: number): Promise<SvnMergeResult> {
	if (!Number.isSafeInteger(revision) || revision <= 0) { throw new Error('Ревизия должна быть положительным целым числом.'); }
	const workingCopy = path.join(workspacePath, 'packages');
	if (!(await stat(workingCopy).catch(() => undefined))?.isDirectory()) { throw new Error(`Не найдена рабочая копия пакетов: ${workingCopy}`); }
	const source = await resolveMergeSource(workingCopy, branch);
	const { stdout, stderr } = await runSvn(['merge', '-c', String(revision), source, workingCopy], workingCopy);
	const output = [stdout, stderr].filter(Boolean).join('\n').trim();
	const touched = parseSvnMergeOutput(output, workingCopy);
	const conflicts = await loadSvnConflicts(workingCopy);
	const files = mergeFileLists(touched, conflicts);
	return { source, revision, workingCopy, files, output };
}

export async function loadConflictContent(workingCopy: string, relativePath: string): Promise<SvnConflictContent> {
	const filePath = safeWorkingCopyPath(workingCopy, relativePath);
	const { stdout } = await runSvn(['info', '--xml', filePath], workingCopy);
	const conflict = parseSvnConflictInfo(stdout);
	if (!conflict) { throw new Error('SVN не вернул текстовые версии конфликта. Возможно, это конфликт дерева.'); }
	const [local, result, incoming] = await Promise.all([
		readText(resolveConflictArtifact(filePath, conflict.local)),
		readText(filePath),
		readText(resolveConflictArtifact(filePath, conflict.incoming)),
	]);
	return { filePath, local, result, incoming, canResolve: true };
}

export async function saveConflictResult(filePath: string, content: string, resolve: boolean): Promise<void> {
	const encoding = usesWindows1251(filePath) ? 'win1251' : 'utf8';
	await writeFile(filePath, iconv.encode(content, encoding));
	if (resolve) { await runSvn(['resolve', '--accept', 'working', filePath], path.dirname(filePath)); }
}

export async function resolveMergeSource(workingCopy: string, value: string): Promise<string> {
	const branch = value.trim().replace(/\\/g, '/').replace(/\/$/, '');
	if (!branch || /[\r\n]/.test(branch)) { throw new Error('Укажите ветку или SVN URL.'); }
	if (/^(?:https?|svn):\/\//i.test(branch) || branch.startsWith('^/')) { return branch; }
	const { stdout } = await runSvn(['info', '--show-item', 'repos-root-url', workingCopy], workingCopy);
	const repositoryRoot = stdout.trim().replace(/\/$/, '');
	if (!repositoryRoot) { throw new Error('Не удалось определить корневой URL SVN-репозитория.'); }
	if (branch === 'trunk' || branch.startsWith('branches/') || branch.startsWith('tags/')) { return `${repositoryRoot}/${branch}`; }
	return `${repositoryRoot}/branches/${branch}`;
}

export function parseSvnMergeOutput(output: string, workingCopy: string): SvnMergeFile[] {
	const byPath = new Map<string, SvnMergeFile>();
	for (const line of output.split(/\r?\n/)) {
		const match = line.match(/^(.)(.)(.)(.)\s+(.+?)\s*$/);
		if (!match || !/[ADUGCR ]/.test(match[1] ?? '') || !/[CU ]/.test(match[2] ?? '')) { continue; }
		const textStatus = match[1] ?? ' ';
		const propertyStatus = match[2] ?? ' ';
		const treeConflict = match[4] === 'C';
		if (textStatus === ' ' && propertyStatus === ' ' && !treeConflict) { continue; }
		const relativePath = normalizeRelativePath(match[5] ?? '', workingCopy);
		if (!relativePath || relativePath === '.') { continue; }
		const conflicted = textStatus === 'C' || propertyStatus === 'C' || treeConflict;
		byPath.set(relativePath, {
			path: relativePath,
			status: conflicted ? 'conflicted' : notificationStatus(textStatus),
			conflicted,
			treeConflict,
		});
	}
	return [...byPath.values()];
}

export function parseSvnConflictInfo(xml: string): { local: string; incoming: string } | undefined {
	const conflict = xml.match(/<conflict\b[^>]*type="text"[^>]*>([\s\S]*?)<\/conflict>/i)?.[1];
	if (!conflict) { return undefined; }
	const local = xmlValue(conflict, 'prev-wc-file');
	const incoming = xmlValue(conflict, 'cur-base-file');
	return local && incoming ? { local, incoming } : undefined;
}

async function loadSvnConflicts(workingCopy: string): Promise<SvnMergeFile[]> {
	const { stdout } = await runSvn(['status', '--xml', workingCopy], workingCopy);
	const result: SvnMergeFile[] = [];
	for (const entry of stdout.matchAll(/<entry\s+path="([^"]+)">([\s\S]*?)<\/entry>/gi)) {
		const body = entry[2] ?? '';
		const item = body.match(/<wc-status\b[^>]*item="([^"]+)"/i)?.[1];
		const treeConflict = /tree-conflicted="true"/i.test(body);
		if (item !== 'conflicted' && !treeConflict) { continue; }
		result.push({ path: normalizeRelativePath(decodeXml(entry[1] ?? ''), workingCopy), status: 'conflicted', conflicted: true, treeConflict });
	}
	return result;
}

function mergeFileLists(touched: SvnMergeFile[], conflicts: SvnMergeFile[]): SvnMergeFile[] {
	const result = new Map(touched.map(file => [file.path.toLocaleLowerCase('ru'), file]));
	for (const conflict of conflicts) {
		const key = conflict.path.toLocaleLowerCase('ru');
		const current = result.get(key);
		result.set(key, current ? { ...current, status: 'conflicted', conflicted: true, treeConflict: conflict.treeConflict } : conflict);
	}
	return [...result.values()].sort((left, right) => Number(right.conflicted) - Number(left.conflicted) || left.path.localeCompare(right.path, 'ru'));
}

function notificationStatus(value: string): SvnMergeFileStatus {
	return value === 'A' ? 'added' : value === 'D' ? 'deleted' : value === 'R' ? 'replaced' : value === 'U' || value === 'G' ? 'modified' : 'unknown';
}

function normalizeRelativePath(value: string, workingCopy: string): string {
	const cleaned = value.replace(/^['"]|['"]$/g, '').trim();
	const absolute = path.isAbsolute(cleaned) ? cleaned : path.resolve(workingCopy, cleaned);
	return path.relative(workingCopy, absolute).replace(/\\/g, '/');
}

function safeWorkingCopyPath(workingCopy: string, relativePath: string): string {
	const root = path.resolve(workingCopy);
	const result = path.resolve(root, relativePath);
	if (result !== root && !result.startsWith(`${root}${path.sep}`)) { throw new Error('Файл находится вне рабочей копии пакетов.'); }
	return result;
}

function resolveConflictArtifact(filePath: string, artifact: string): string {
	return path.isAbsolute(artifact) ? artifact : path.resolve(path.dirname(filePath), artifact);
}

async function readText(filePath: string): Promise<string> {
	await access(filePath);
	return iconv.decode(await readFile(filePath), usesWindows1251(filePath) ? 'win1251' : 'utf8');
}

function usesWindows1251(filePath: string): boolean { return ['.pkf', '.pas', '.bat'].includes(path.extname(filePath).toLocaleLowerCase('en-US')); }

function xmlValue(xml: string, tag: string): string | undefined {
	const value = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1];
	return value ? decodeXml(value) : undefined;
}

function decodeXml(value: string): string {
	return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function runSvn(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
	try {
		return await execFileAsync('svn', args, { cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
	} catch (error) {
		const detail = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : error instanceof Error ? error.message : String(error);
		throw new Error(`svn ${args[0]}: ${detail}`);
	}
}
