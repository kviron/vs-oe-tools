import { Client } from 'pg';
import type { SerializedQueryResult } from '../../infrastructure/database/databaseQueryExecutor';
import { executeMonitoredQuery, serializeQueryResult } from '../../infrastructure/database/databaseQueryExecutor';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';

export interface ManualSqlExecutionResult {
	result: SerializedQueryResult;
	durationMs: number;
	database: string;
}

export async function executeSql(text: string): Promise<ManualSqlExecutionResult> {
	const queryText = text.trim();
	if (!queryText) {
		throw new Error('Введите SQL-запрос.');
	}

	const options = await getProjectDatabaseOptions();
	const client = new Client({
		...options,
		application_name: 'vc-ve-tools-sql-executor',
		connectionTimeoutMillis: 5000,
	});
	const started = performance.now();
	try {
		await client.connect();
		const result = await executeMonitoredQuery<Record<string, unknown>>(client, {
			text: queryText,
			source: 'Исполнитель SQL',
			database: options.database,
		});
		return {
			result: serializeQueryResult(result),
			durationMs: performance.now() - started,
			database: options.database,
		};
	} finally {
		await client.end().catch(() => undefined);
	}
}

