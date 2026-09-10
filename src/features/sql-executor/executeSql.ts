import type { SerializedQueryResult } from '../../core/queryResult';
import { executeMonitoredQuery, serializeQueryResult } from '../../infrastructure/database/databaseQueryExecutor';
import { withProjectDatabaseSession } from '../../infrastructure/database/projectDatabaseSession';
import { adaptVeSqlToPostgres } from './sqlDialectAdapter';

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

	const started = performance.now();
	return withProjectDatabaseSession(async ({ client, options }) => {
		try {
			const postgresText = await adaptVeSqlToPostgres(client, queryText);
			const result = await executeMonitoredQuery<Record<string, unknown>>(client, {
				text: postgresText,
				displayText: queryText,
				source: 'Исполнитель SQL',
				database: options.database,
			});
			return {
				result: serializeQueryResult(result),
				durationMs: performance.now() - started,
				database: options.database,
			};
		} finally {
			// A manual BEGIN must not leave a pooled connection in a transaction.
			await client.query('ROLLBACK').catch(() => undefined);
		}
	}, undefined, 'vc-ve-tools-sql-executor');
}
