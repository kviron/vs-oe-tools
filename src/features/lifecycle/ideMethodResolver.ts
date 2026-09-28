import { Client } from 'pg';
import { loadRdboadmDatabases, rdboadmDatabaseOptions } from '../../infrastructure/configuration/rdboadmIni';

const ideClassName = 'Функции_IDE';

/** Resolve a client wrapper in the exact database selected for the OEExecTask call. */
export async function resolveIdeMethodId(workspacePath: string, database: string, host: string, methodName: string): Promise<number> {
	const { databases } = await loadRdboadmDatabases(workspacePath);
	const matches = databases.map(rdboadmDatabaseOptions).filter(options =>
		options.database.toLowerCase() === database.toLowerCase() && options.host.toLowerCase() === host.toLowerCase());
	if (matches.length !== 1) {
		throw new Error(`Для ${host}/${database} нужен один профиль в rdboadm.ini; найдено ${matches.length}.`);
	}
	const client = new Client({ ...matches[0], application_name: 'vc-ve-tools-ide-method-resolver', connectionTimeoutMillis: 5000 });
	await client.connect();
	try {
		const identity = await client.query<{ database: string }>('SELECT current_database() AS database');
		if (identity.rows[0]?.database.toLowerCase() !== database.toLowerCase()) {
			throw new Error(`Подключение открыто к ${identity.rows[0]?.database ?? '<неизвестно>'}, ожидалась ${database}.`);
		}
		const result = await client.query<{ classid: number; methodid: number | null }>(
			`SELECT c.id AS classid, m.id AS methodid
			 FROM classes c LEFT JOIN methods m ON m.seniorid=c.id AND m.name=$2
			 WHERE c.name=$1 ORDER BY c.id, m.id LIMIT 3`, [ideClassName, methodName]);
		if (result.rows.length === 0) { throw new Error(`Класс ${ideClassName} не найден в базе ${database}.`); }
		if (result.rows.length !== 1) { throw new Error(`В базе ${database} найдено несколько классов ${ideClassName} или методов ${methodName}.`); }
		const id = Number(result.rows[0].methodid);
		if (!Number.isSafeInteger(id) || id <= 0) { throw new Error(`Метод ${ideClassName}.${methodName} не найден в базе ${database}.`); }
		return id;
	} finally {
		await client.end();
	}
}
