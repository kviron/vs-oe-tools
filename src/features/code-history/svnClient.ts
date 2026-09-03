import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';

export interface SvnLogEntry {
	revision: number;
	author: string;
	date: Date;
	message: string;
}

export interface SvnBlameLine {
	line: number;
	revision: number;
	author: string;
	date: Date;
}

export async function svnLog(fileName: string, limit?: number): Promise<SvnLogEntry[]> {
	const args = ['log', '--xml'];
	if (limit !== undefined) {
		args.push('--limit', String(limit));
	}
	args.push(fileName);
	const xml = (await runSvn(args, fileName)).toString('utf8');
	return [...xml.matchAll(/<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g)].map(match => ({
		revision: Number(match[1]),
		author: xmlValue(match[2], 'author') || 'неизвестен',
		date: new Date(xmlValue(match[2], 'date') || 0),
		message: xmlValue(match[2], 'msg'),
	}));
}

export async function svnBlameRevisions(fileName: string, startLine: number, endLine: number): Promise<Set<number>> {
	const lines = await svnBlame(fileName);
	const revisions = new Set<number>();
	for (const entry of lines) {
		if (entry.line >= startLine && entry.line <= endLine) {
			revisions.add(entry.revision);
		}
	}
	return revisions;
}

export async function svnBlame(fileName: string): Promise<SvnBlameLine[]> {
	const xml = (await runSvn(['blame', '--xml', fileName], fileName)).toString('utf8');
	return [...xml.matchAll(/<entry\s+line-number="(\d+)">([\s\S]*?)<\/entry>/g)].map(match => {
		const body = match[2];
		return {
			line: Number(match[1]),
			revision: Number(body.match(/<commit\s+revision="(\d+)">/)?.[1]),
			author: xmlValue(body, 'author') || 'неизвестен',
			date: new Date(xmlValue(body, 'date') || 0),
		};
	}).filter(entry => Number.isSafeInteger(entry.revision));
}

export async function svnCat(fileName: string, revision: number): Promise<string> {
	if (revision < 0) {
		return '';
	}
	const bytes = await runSvn(['cat', '-r', String(revision), fileName], fileName);
	return legacyExtension(fileName) ? iconv.decode(bytes, 'win1251') : bytes.toString('utf8');
}

export async function svnCatBase(fileName: string): Promise<string> {
	const bytes = await runSvn(['cat', '-r', 'BASE', fileName], fileName);
	return legacyExtension(fileName) ? iconv.decode(bytes, 'win1251') : bytes.toString('utf8');
}

async function runSvn(args: string[], fileName: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const process = spawn('svn', args, { cwd: path.dirname(fileName), windowsHide: true });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		process.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		process.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		process.on('error', reject);
		process.on('close', code => {
			if (code === 0) {
				resolve(Buffer.concat(stdout));
				return;
			}
			const detail = decodeConsole(Buffer.concat(stderr)).trim();
			reject(new Error(`svn ${args[0]} завершился с кодом ${code ?? 'неизвестен'}${detail ? `: ${detail}` : ''}`));
		});
	});
}

function xmlValue(xml: string, tag: string): string {
	const value = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
	return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function legacyExtension(fileName: string): boolean {
	return ['.pas', '.pkf', '.bat'].includes(path.extname(fileName).toLocaleLowerCase('en-US'));
}

function decodeConsole(value: Buffer): string {
	const utf8 = value.toString('utf8');
	return utf8.includes('\uFFFD') ? iconv.decode(value, 'win1251') : utf8;
}
