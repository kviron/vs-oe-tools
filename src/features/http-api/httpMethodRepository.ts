import * as iconv from 'iconv-lite';
import { executeMonitoredQuery } from '../../infrastructure/database/databaseQueryExecutor';
import { withProjectDatabaseSession } from '../../infrastructure/database/projectDatabaseSession';

export interface HttpMethodDefinition {
	id: number;
	name: string;
	methodId: number;
	signature: string;
	description: string;
}

export interface HttpParameterValue {
	id: number;
	name: string;
}

export async function loadHttpMethods(): Promise<HttpMethodDefinition[]> {
	return withProjectDatabaseSession(async ({ client, options }) => {
		const result = await executeMonitoredQuery<{
			id: number;
			name: string;
			methodid: number;
			signature: Buffer | string | null;
			description: Buffer | string | null;
		}>(client, {
			text: `SELECT http.id, http.name, http.method AS methodid, method.signature, http.description
			 FROM httpmethods http
			 INNER JOIN methods method ON method.id = http.method
			 ORDER BY http.name`,
			source: 'Каталог HTTP-методов',
			database: options.database,
		});
		return result.rows.map(row => ({
			id: Number(row.id),
			name: row.name,
			methodId: Number(row.methodid),
			signature: decodeHttpText(row.signature),
			description: decodeHttpText(row.description),
		}));
	});
}

export function decodeHttpText(value: Buffer | string | null): string {
	return Buffer.isBuffer(value) ? iconv.decode(value, 'win1251') : (value ?? '');
}

export async function searchHttpParameterValues(typeName: string, query: string, limit = 100): Promise<HttpParameterValue[]> {
	return withProjectDatabaseSession(async ({ client, options }) => {
		const value = query.trim();
		const numericId = /^\d+$/u.test(value) ? Number(value) : null;
		const result = await executeMonitoredQuery<{ id: number; name: string }, [string, number | null, string, number]>(client, {
			text: `SELECT object.id, object.name
			 FROM classes type_class
			 INNER JOIN abstract object ON object.classid = type_class.id
			 WHERE lower(type_class.name) = lower($1)
			   AND (($2::bigint IS NOT NULL AND object.id = $2) OR object.name ILIKE $3)
			 ORDER BY CASE WHEN object.id = $2 THEN 0 WHEN lower(object.name) = lower($3) THEN 1 ELSE 2 END, object.name, object.id
			 LIMIT $4`,
			values: [typeName, numericId, numericId === null ? `%${value}%` : value, Math.min(Math.max(limit, 1), 200)],
			source: `Значения HTTP-параметра типа ${typeName}`,
			database: options.database,
		});
		return result.rows.map(row => ({ id: Number(row.id), name: decodeHttpText(Buffer.isBuffer(row.name) ? row.name : String(row.name)) }));
	});
}
