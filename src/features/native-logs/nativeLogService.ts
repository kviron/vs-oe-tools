import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';

export interface NativeLogFile {
	name: string;
	path: string;
	size: number;
	modifiedAt: string;
}

export interface NativeLogContent extends NativeLogFile {
	content: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	truncated: boolean;
}

const maximumFiles = 500;
const maximumReadBytes = 4 * 1024 * 1024;

export async function listNativeLogs(workspacePath: string, limit = 100): Promise<{ directory: string; files: NativeLogFile[] }> {
	const directory = await resolveNativeLogDirectory(workspacePath);
	const entries = await readdir(directory, { withFileTypes: true });
	const candidates = entries
		.filter(entry => entry.isFile())
		.slice(0, maximumFiles);
	const files = await Promise.all(candidates.map(async entry => {
		const filePath = path.join(directory, entry.name);
		const metadata = await stat(filePath);
		return { name: entry.name, path: filePath, size: metadata.size, modifiedAt: metadata.mtime.toISOString() };
	}));
	files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
	return { directory, files: files.slice(0, Math.max(1, Math.min(limit, maximumFiles))) };
}

export async function readNativeLog(
	workspacePath: string,
	fileName: string,
	startLine = 1,
	maxLines = 1000,
): Promise<NativeLogContent> {
	if (!fileName || path.basename(fileName) !== fileName || fileName.includes('/') || fileName.includes('\\')) {
		throw new Error('Имя файла лога должно быть именем без пути.');
	}
	const { directory, files } = await listNativeLogs(workspacePath, maximumFiles);
	const file = files.find(item => item.name.toLocaleLowerCase('en') === fileName.toLocaleLowerCase('en'));
	if (!file) {
		throw new Error(`Файл лога ${fileName} не найден в ${directory}.`);
	}
	if (file.size > maximumReadBytes) {
		throw new Error(`Файл ${file.name} слишком большой для просмотра (${file.size} байт, максимум ${maximumReadBytes}).`);
	}
	const content = decodeNativeLog(await readFile(file.path));
	const lines = content.replace(/\r\n?/gu, '\n').split('\n');
	const normalizedStart = Math.max(1, Math.min(startLine, Math.max(lines.length, 1)));
	const normalizedLimit = Math.max(1, Math.min(maxLines, 100_000));
	const selected = lines.slice(normalizedStart - 1, normalizedStart - 1 + normalizedLimit);
	return {
		...file,
		content: selected.join('\n'),
		startLine: normalizedStart,
		endLine: normalizedStart + selected.length - 1,
		totalLines: lines.length,
		truncated: normalizedStart > 1 || normalizedStart - 1 + selected.length < lines.length,
	};
}

async function resolveNativeLogDirectory(workspacePath: string): Promise<string> {
	const candidates = [path.join(workspacePath, 'bin', 'logs'), path.join(workspacePath, 'bin.win64', 'logs')];
	for (const directory of candidates) {
		try {
			const entries = await readdir(directory, { withFileTypes: true });
			if (entries.some(entry => entry.isFile())) {
				return directory;
			}
		} catch {
			// Try the next native client directory.
		}
	}
	throw new Error(`Логи нативного клиента не найдены: ${candidates.join(' или ')}.`);
}

function decodeNativeLog(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		return bytes.subarray(3).toString('utf8');
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return bytes.subarray(2).toString('utf16le');
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return iconv.decode(bytes.subarray(2), 'utf16-be');
	}
	const sampleLength = Math.min(bytes.length, 1024);
	let oddNullBytes = 0;
	for (let index = 1; index < sampleLength; index += 2) {
		if (bytes[index] === 0) { oddNullBytes += 1; }
	}
	if (sampleLength >= 4 && oddNullBytes / Math.floor(sampleLength / 2) > 0.3) {
		return bytes.toString('utf16le');
	}
	return iconv.decode(bytes, 'win1251');
}
