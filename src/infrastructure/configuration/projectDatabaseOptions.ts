import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { databaseProfileSetting, databaseRoleSetting } from '../../core/constants';
import type { DatabaseConnectionOptions, DatabaseRole } from '../../features/classes/models';
import { loadRdboadmDatabases, rdboadmDatabaseOptions } from './rdboadmIni';

export function parseVarsFile(content: string): Map<string, string> {
	const variables = new Map<string, string>();

	for (const sourceLine of content.split(/\r?\n/)) {
		const match = sourceLine.match(/^\s*@?set\s+(.+?)\s*$/i);
		if (!match) {
			continue;
		}

		let assignment = match[1];
		if (assignment.startsWith('"') && assignment.endsWith('"')) {
			assignment = assignment.slice(1, -1);
		}

		const separator = assignment.indexOf('=');
		if (separator < 1) {
			continue;
		}

		const name = assignment.slice(0, separator).trim().toLowerCase();
		const value = assignment.slice(separator + 1).trim();
		variables.set(name, value);
	}

	return variables;
}

export function getDatabaseRole(): DatabaseRole {
	return vscode.workspace.getConfiguration('vcVeTools').get(databaseRoleSetting) === 'test'
		? 'test'
		: 'main';
}

function getRoleVariable(variables: Map<string, string>, name: string, role: DatabaseRole): string | undefined {
	return variables.get(`${name}_${role}`) ?? variables.get(name);
}

export async function getProjectDatabaseOptions(): Promise<DatabaseConnectionOptions> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		throw new Error('Сначала откройте папку проекта.');
	}

	const selectedProfile = vscode.workspace.getConfiguration('vcVeTools').get<string>(databaseProfileSetting, '');
	try {
		const { databases } = await loadRdboadmDatabases(workspaceFolder.uri.fsPath);
		const selected = databases.find(database => database.id.toLowerCase() === selectedProfile.toLowerCase()) ?? databases[0];
		if (selected) { return rdboadmDatabaseOptions(selected); }
	} catch (error) {
		if (selectedProfile) { throw error; }
	}

	const varsPath = vscode.Uri.joinPath(workspaceFolder.uri, 'Vars.bat');
	let varsContent: string;
	try {
		varsContent = iconv.decode(await readFile(varsPath.fsPath), 'win1251');
	} catch {
		throw new Error('В корне проекта не найден или недоступен файл Vars.bat.');
	}

	const variables = parseVarsFile(varsContent);
	const databaseRole = getDatabaseRole();
	const password = getRoleVariable(variables, 'oedbmspassword', databaseRole);
	const database = variables.get(`devdbname_${databaseRole}`);
	const port = Number(getRoleVariable(variables, 'oedbmsport', databaseRole) ?? '5432');

	if (!database) {
		throw new Error('В Vars.bat не указано devDBName_main.');
	}
	if (!password) {
		throw new Error('В Vars.bat не указан oeDBMSPassword.');
	}
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('В Vars.bat указан некорректный oeDBMSPort.');
	}

	return {
		host: getRoleVariable(variables, 'oedbmshost', databaseRole) ?? 'localhost',
		port,
		database,
		user: getRoleVariable(variables, 'oedbmsusername', databaseRole) ?? 'postgres',
		password,
	};
}
