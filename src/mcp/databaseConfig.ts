import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import type { DatabaseConnectionOptions, DatabaseRole } from '../features/classes/models';
import { loadRdboadmDatabases, rdboadmDatabaseOptions } from '../infrastructure/configuration/rdboadmIni';

export async function loadMcpDatabaseOptions(workspacePath: string, role: DatabaseRole, profile?: string): Promise<DatabaseConnectionOptions> {
	try {
		const { databases } = await loadRdboadmDatabases(workspacePath);
		const selected = databases.find(database => database.id.toLowerCase() === profile?.toLowerCase()) ?? databases[0];
		if (selected) { return rdboadmDatabaseOptions(selected); }
	} catch (error) {
		if (profile) { throw error; }
	}
	const varsContent = iconv.decode(await readFile(path.join(workspacePath, 'Vars.bat')), 'win1251');
	const variables = parseVarsFile(varsContent);
	const password = roleVariable(variables, 'oedbmspassword', role);
	const database = variables.get(`devdbname_${role}`);
	const port = Number(roleVariable(variables, 'oedbmsport', role) ?? '5432');

	if (!database || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Vars.bat does not contain valid connection settings for the ${role} database.`);
	}

	return {
		host: roleVariable(variables, 'oedbmshost', role) ?? 'localhost',
		port,
		database,
		user: roleVariable(variables, 'oedbmsusername', role) ?? 'postgres',
		password,
	};
}

function parseVarsFile(content: string): Map<string, string> {
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
		if (separator > 0) {
			variables.set(assignment.slice(0, separator).trim().toLowerCase(), assignment.slice(separator + 1).trim());
		}
	}
	return variables;
}

function roleVariable(variables: Map<string, string>, name: string, role: DatabaseRole): string | undefined {
	return variables.get(`${name}_${role}`) ?? variables.get(name);
}
