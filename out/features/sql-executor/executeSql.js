"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeSql = executeSql;
const databaseQueryExecutor_1 = require("../../infrastructure/database/databaseQueryExecutor");
const projectDatabaseSession_1 = require("../../infrastructure/database/projectDatabaseSession");
const sqlDialectAdapter_1 = require("./sqlDialectAdapter");
async function executeSql(text) {
    const queryText = text.trim();
    if (!queryText) {
        throw new Error('Введите SQL-запрос.');
    }
    const started = performance.now();
    return (0, projectDatabaseSession_1.withProjectDatabaseSession)(async ({ client, options }) => {
        try {
            const postgresText = await (0, sqlDialectAdapter_1.adaptVeSqlToPostgres)(client, queryText);
            const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
                text: postgresText,
                displayText: queryText,
                source: 'Исполнитель SQL',
                database: options.database,
            });
            return {
                result: (0, databaseQueryExecutor_1.serializeQueryResult)(result),
                durationMs: performance.now() - started,
                database: options.database,
            };
        }
        finally {
            // A manual BEGIN must not leave a pooled connection in a transaction.
            await client.query('ROLLBACK').catch(() => undefined);
        }
    }, undefined, 'vc-ve-tools-sql-executor');
}
//# sourceMappingURL=executeSql.js.map