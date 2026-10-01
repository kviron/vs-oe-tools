import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import { matchesSearch, defaultSearchOptions, type SearchOptions } from '../../core/searchMatch';

export interface NativeLogFile {
	name: string;
	path: string;
	size: number;
	modifiedAt: string;
	createdAt: string;
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

export async function listNativeLogs(workspacePath: string, limit = 100, query = '', options: SearchOptions = defaultSearchOptions, isCancelled: () => boolean = () => false): Promise<{ directory: string; files: NativeLogFile[] }> {
	const directory = await resolveNativeLogDirectory(workspacePath);
	const entries = await readdir(directory, { withFileTypes: true });
	const candidates = entries
		.filter(entry => entry.isFile());
	const files = await Promise.all(candidates.map(async entry => {
		const filePath = path.join(directory, entry.name);
		const metadata = await stat(filePath);
		return { name: entry.name, path: filePath, size: metadata.size, modifiedAt: metadata.mtime.toISOString(), createdAt: metadata.birthtime.toISOString() };
	}));
	files.sort((left, right) => Math.max(Date.parse(right.modifiedAt), Date.parse(right.createdAt)) - Math.max(Date.parse(left.modifiedAt), Date.parse(left.createdAt)) || left.name.localeCompare(right.name));
	const selected: NativeLogFile[] = [];
	for (const file of files) {
		if (isCancelled()) { break; }
		let matches = matchesSearch(file.name, query, options);
		if (!matches && query.trim()) {
			matches = await matchesNativeLogContents(file.path, query, options, isCancelled);
		}
		if (matches) { selected.push(file); }
		if (selected.length >= Math.max(1, Math.min(limit, maximumFiles))) { break; }
	}
	return { directory, files: selected };
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
	const directory = await resolveNativeLogDirectory(workspacePath);
	const filePath = path.join(directory, fileName);
	const metadata = await stat(filePath);
	if (!metadata.isFile()) { throw new Error(`Файл лога ${fileName} не найден в ${directory}.`); }
	const file: NativeLogFile = { name: fileName, path: filePath, size: metadata.size, modifiedAt: metadata.mtime.toISOString(), createdAt: metadata.birthtime.toISOString() };
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

function nativeLogEncoding(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		return 'utf8';
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return 'utf16le';
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return 'utf16-be';
	}
	const sampleLength = Math.min(bytes.length, 1024);
	let oddNullBytes = 0;
	for (let index = 1; index < sampleLength; index += 2) {
		if (bytes[index] === 0) { oddNullBytes += 1; }
	}
	if (sampleLength >= 4 && oddNullBytes / Math.floor(sampleLength / 2) > 0.3) {
		return 'utf16le';
	}
	return 'win1251';
}

function decodeNativeLog(bytes: Buffer): string {
 return iconv.decode(bytes, nativeLogEncoding(bytes));
}

/** Searches decoded chunks and line summaries without retaining a complete log. */
async function matchesNativeLogContents(filePath: string, query: string, options: SearchOptions, isCancelled: () => boolean): Promise<boolean> {
 const size = query.trim().length + 2;
 let decoder: ReturnType<typeof iconv.getDecoder> | undefined;
 let carry = '';
 let carryPrefix = '';
 const escapedQuery = query.trim().replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
 const wordPattern = new RegExp('(^|[^\\p{L}\\p{N}_])' + escapedQuery + '(?=$|[^\\p{L}\\p{N}_])', options.caseSensitive ? 'gu' : 'giu');
 let filePrefix = '';
 let fileTail = '';
 let fileLength = 0;
 let linePrefix = '';
 let lineTail = '';
 let lineLength = 0;
 const lineMatches = () => {
  const endsWithCR = lineTail.endsWith('\r');
  const length = lineLength - (endsWithCR ? 1 : 0);
  const prefix = linePrefix.slice(0, length);
  const tail = endsWithCR ? lineTail.slice(0, -1) : lineTail;
  if (options.mode === 'exact') {return length <= size && matchesSearch(prefix, query, options);}
  if (options.mode === 'starts') {return matchesSearch(prefix, query, options);}
  return options.mode === 'ends' && matchesSearch(tail, query, options);
 };
 const inspect = (text: string, final = false): boolean => {
  fileLength += text.length;
  filePrefix = (filePrefix + text).slice(0, size);
  fileTail = (fileTail + text).slice(-size);
  if (options.mode === 'contains' || options.mode === 'word') {
   const window = carryPrefix + carry + text;
   if (options.mode === 'contains' && matchesSearch(window, query, options)) { return true; }
   if (options.mode === 'word') {
    wordPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = wordPattern.exec(window))) {
     if (final || match.index + match[0].length < window.length) { return true; }
    }
   }
   carryPrefix = window.length > size ? window.slice(-size - 1, -size) : '';
   carry = window.slice(-size);
  }
  const parts = text.split('\n');
  for (let index = 0; index < parts.length; index++) {
   const part = parts[index];
   lineLength += part.length;
   linePrefix = (linePrefix + part).slice(0, size);
   lineTail = (lineTail + part).slice(-size);
   if (index < parts.length - 1) {
    if (lineMatches()) {return true;}
    linePrefix = ''; lineTail = ''; lineLength = 0;
   }
  }
  return final && (lineMatches() || (options.mode === 'starts' && matchesSearch(filePrefix, query, options))
   || (options.mode === 'ends' && matchesSearch(fileTail, query, options))
   || (options.mode === 'exact' && fileLength <= size && matchesSearch(filePrefix, query, options)));
 };
 for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
  if (isCancelled()) {return false;}
  const bytes = chunk as Buffer;
  decoder ??= iconv.getDecoder(nativeLogEncoding(bytes));
  if (inspect(decoder.write(bytes))) {return true;}
 }
 return inspect(decoder?.end() || '', true);
}
