import { Client } from 'pg';
import * as iconv from 'iconv-lite';
import { getProjectDatabaseOptions } from '../configuration/projectDatabaseOptions';
import { executeMonitoredQuery } from './databaseQueryExecutor';
import { extractCodeFromChangeValues } from './methodHistoryParsing';

export interface MethodHistoryEntry {
	revision: string;
	changedAt: Date;
	userId: string;
	userName: string;
	loginName: string;
	computerName: string;
	comment: string;
	oldCode: string;
	newCode: string;
}

interface MethodHistoryRow {
	data: Record<string, unknown>;
	userdata?: Record<string, unknown> | null;
}

interface UserTableInfo {
	table_schema: string;
	table_name: string;
	id_column: string;
}

export async function getMethodHistory(methodId: number): Promise<MethodHistoryEntry[]> {
	const options = await getProjectDatabaseOptions();
	const client = new Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
	try {
		await client.connect();
		const userTable = await findUserTable(client, options.database).catch(() => undefined);
		const userJoin = userTable ? buildUserJoin(userTable) : '';
		const userColumns = userTable ? ', to_jsonb(users) AS userdata' : '';
		const result = await executeMonitoredQuery<MethodHistoryRow, [number]>(client, {
			text: `SELECT to_jsonb(log_entry) AS data${userColumns}
			 FROM logcchangedobject AS log_entry
			 ${userJoin}
			 WHERE log_entry.objid = $1 AND log_entry.objclassid = 5
			 ORDER BY log_entry.changedate DESC`,
			values: [methodId],
			source: `История изменений метода ${methodId}`,
			database: options.database,
		});
		return result.rows
			.map((row, index) => toHistoryEntry(row.data, index, row.userdata))
			.filter((entry): entry is MethodHistoryEntry => entry !== undefined);
	} finally {
		await client.end().catch(() => undefined);
	}
}

function toHistoryEntry(data: Record<string, unknown>, index: number, userData?: Record<string, unknown> | null): MethodHistoryEntry | undefined {
	const oldValues = decodeText(readValue(data, 'oldvalues'));
	const newValues = decodeText(readValue(data, 'newvalues'));
	const oldCode = extractCodeFromChangeValues(oldValues);
	const newCode = extractCodeFromChangeValues(newValues);
	if (oldCode === undefined && newCode === undefined) {
		return undefined;
	}
	return {
		revision: readText(data, 'id', 'logid', 'transactionid'),
		changedAt: new Date(readText(data, 'changedate') || 0),
		userId: readText(data, 'userid') || 'неизвестен',
		userName: decodeText(readValue(userData ?? {}, 'username', 'fullname', 'name', 'fio')),
		loginName: decodeText(readValue(userData ?? {}, 'loginname', 'login', 'userlogin')),
		computerName: readText(data, 'computername'),
		comment: decodeText(readValue(data, 'transactioncomment')),
		oldCode: oldCode ?? '',
		newCode: newCode ?? '',
	};
}

async function findUserTable(client: Client, database: string): Promise<UserTableInfo | undefined> {
	const result = await executeMonitoredQuery<UserTableInfo>(client, {
		text: `SELECT table_schema, table_name,
		        min(column_name) FILTER (WHERE lower(column_name) = 'id') AS id_column
		 FROM information_schema.columns
		 WHERE lower(table_name) = 'users'
		 GROUP BY table_schema, table_name
		 HAVING bool_or(lower(column_name) = 'id')
		 ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema
		 LIMIT 1`,
		source: 'Поиск данных пользователей для истории кода',
		database,
	});
	return result.rows[0];
}

function buildUserJoin(table: UserTableInfo): string {
	return `LEFT JOIN ${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)} AS users ON users.${quoteIdentifier(table.id_column || 'id')} = log_entry.userid`;
}

function quoteIdentifier(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function readValue(row: Record<string, unknown>, ...names: string[]): unknown {
	const values = new Map(Object.entries(row).map(([key, value]) => [key.toLocaleLowerCase('en-US'), value]));
	for (const name of names) {
		const value = values.get(name.toLocaleLowerCase('en-US'));
		if (value !== undefined && value !== null) {
			return value;
		}
	}
	return undefined;
}

function readText(row: Record<string, unknown>, ...names: string[]): string {
	const value = readValue(row, ...names);
	return value === undefined ? '' : String(value);
}

function decodeText(value: unknown): string {
	if (Buffer.isBuffer(value)) {
		return iconv.decode(value, 'win1251');
	}
	const text = value === undefined || value === null ? '' : String(value);
	const bytea = text.match(/^\\x([\da-f]+)$/i);
	return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}
