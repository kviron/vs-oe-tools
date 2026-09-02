"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeSql = executeSql;
const pg_1 = require("pg");
const databaseQueryExecutor_1 = require("../../infrastructure/database/databaseQueryExecutor");
const projectDatabaseOptions_1 = require("../../infrastructure/configuration/projectDatabaseOptions");
async function executeSql(text) {
    const queryText = text.trim();
    if (!queryText) {
        throw new Error('Введите SQL-запрос.');
    }
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({
        ...options,
        application_name: 'vc-ve-tools-sql-executor',
        connectionTimeoutMillis: 5000,
    });
    const started = performance.now();
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: queryText,
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
        await client.end().catch(() => undefined);
    }
}
//# sourceMappingURL=executeSql.js.map