import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import type { DatabaseConnectionOptions } from '../../features/classes/models';

export interface RdboadmField { key: string; value: string }
export interface RdboadmDatabase { id: string; name: string; fields: RdboadmField[] }

export function parseRdboadmIni(content: string): RdboadmDatabase[] {
	const databases: RdboadmDatabase[] = [];
	let current: RdboadmDatabase | undefined;
	for (const line of content.split(/\r?\n/)) {
		const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
		if (section) {
			current = { id: section[1].trim(), name: section[1].trim(), fields: [] };
			databases.push(current);
			continue;
		}
		const assignment = line.match(/^\s*([^;#][^=]*?)\s*=\s*(.*?)\s*$/);
		if (current && assignment) {
			current.fields.push({ key: assignment[1].trim(), value: assignment[2] });
			if (assignment[1].trim().toLowerCase() === 'dispname' && assignment[2]) { current.name = assignment[2]; }
		}
	}
	return databases;
}

export function updateRdboadmSection(content: string, sectionId: string, fields: RdboadmField[]): string {
	const values = new Map(fields.map(field => [field.key.toLowerCase(), field.value]));
	const lines = content.split(/(\r?\n)/);
	let inSection = false;
	let found = false;
	for (let index = 0; index < lines.length; index += 2) {
		const section = lines[index].match(/^\s*\[([^\]]+)\]\s*$/);
		if (section) {
			if (inSection) { break; }
			inSection = section[1].trim().toLowerCase() === sectionId.toLowerCase();
			found ||= inSection;
			continue;
		}
		if (!inSection) { continue; }
		const assignment = lines[index].match(/^(\s*)([^;#][^=]*?)(\s*=\s*)(.*?)(\s*)$/);
		if (!assignment) { continue; }
		const key = assignment[2].trim().toLowerCase();
		if (values.has(key)) { lines[index] = `${assignment[1]}${assignment[2]}${assignment[3]}${values.get(key)}${assignment[5]}`; }
	}
	if (!found) { throw new Error(`В rdboadm.ini не найдена секция [${sectionId}].`); }
	return lines.join('');
}

export function resolveRdboadmPath(workspacePath: string): string {
	return path.basename(workspacePath).toLowerCase() === 'trunk'
		? path.join(workspacePath, 'bin', 'rdboadm.ini')
		: path.join(workspacePath, 'trunk', 'bin', 'rdboadm.ini');
}

export async function loadRdboadmDatabases(workspacePath: string): Promise<{ path: string; databases: RdboadmDatabase[] }> {
	const iniPath = resolveRdboadmPath(workspacePath);
	const content = iconv.decode(await readFile(iniPath), 'win1251');
	return { path: iniPath, databases: parseRdboadmIni(content) };
}

export async function saveRdboadmDatabase(workspacePath: string, database: RdboadmDatabase): Promise<void> {
	const iniPath = resolveRdboadmPath(workspacePath);
	const content = iconv.decode(await readFile(iniPath), 'win1251');
	await writeFile(iniPath, iconv.encode(updateRdboadmSection(content, database.id, database.fields), 'win1251'));
}

export function rdboadmDatabaseOptions(database: RdboadmDatabase): DatabaseConnectionOptions {
	const fields = new Map(database.fields.map(field => [field.key.toLowerCase(), field.value]));
	const dbPath = fields.get('dbpath')?.trim();
	const match = dbPath?.match(/^(.+?)(?::(\d+))?\/([^/]+)$/);
	const user = fields.get('dbusername');
	const password = fields.get('dbpassword');
	if (!match || !user || password === undefined) { throw new Error(`В секции [${database.id}] некорректны dbpath, dbusername или dbpassword.`); }
	const port = Number(match[2] ?? '5432');
	if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error(`В секции [${database.id}] указан некорректный порт.`); }
	return { host: match[1], port, database: match[3], user, password };
}
