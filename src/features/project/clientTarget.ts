import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import * as vscode from 'vscode';
import type { DatabaseRole } from '../../core/database';
import { parseVarsFile } from '../../infrastructure/configuration/projectDatabaseOptions';
import { loadRdboadmDatabases } from '../../infrastructure/configuration/rdboadmIni';

export interface ClientTarget {
	workspacePath: string;
	database: string;
	host: string;
	serverPort?: number;
}

export async function resolveClientTarget(role: DatabaseRole): Promise<ClientTarget> {
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspacePath) { throw new Error('Сначала откройте папку проекта Восточного Экспресса.'); }
	const variables = parseVarsFile(iconv.decode(await readFile(path.join(workspacePath, 'Vars.bat')), 'win1251'));
	const database = variables.get(`devdbname_${role}`);
	if (!database) { throw new Error(`В Vars.bat не указано devDBName_${role}.`); }
	const host = variables.get(`oedbmshost_${role}`) ?? variables.get('oedbmshost') ?? 'localhost';
	let serverPort: number | undefined;
	try {
		const { databases } = await loadRdboadmDatabases(workspacePath);
		const profile = databases.find(item => item.id.toLowerCase() === database.toLowerCase());
		const rawPort = profile?.fields.find(field => field.key.toLowerCase() === 'tcpport')?.value;
		const parsed = Number(rawPort);
		if (rawPort && Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) { serverPort = parsed; }
	} catch { /* The client can still start without rdboadm.ini. */ }
	return { workspacePath, database, host, serverPort };
}

export async function requireClientExecutable(workspacePath: string): Promise<void> {
	const executablePath = path.join(workspacePath, 'bin', 'fme.exe');
	const executableStat = await stat(executablePath).catch(() => undefined);
	if (!executableStat?.isFile()) { throw new Error(`Не найден клиент Восточного Экспресса: ${executablePath}.`); }
}
