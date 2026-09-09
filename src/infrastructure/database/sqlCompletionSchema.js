"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSqlCompletionSchema = getSqlCompletionSchema;
const pg_1 = require("pg");
const sqlCompletionSchema_1 = require("../../features/sql-executor/sqlCompletionSchema");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const cacheDurationMs = 5 * 60_000;
const cache = new Map();
async function getSqlCompletionSchema() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const cacheKey = `${options.host}:${options.port}/${options.database}/${options.user}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    const value = loadSqlCompletionSchema(options);
    cache.set(cacheKey, { expiresAt: Date.now() + cacheDurationMs, value });
    try {
        return await value;
    }
    catch (error) {
        cache.delete(cacheKey);
        throw error;
    }
}
async function loadSqlCompletionSchema(options) {
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools-sql-completion', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await client.query(`
			SELECT table_schema, table_name, column_name
			FROM information_schema.columns
			WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
			ORDER BY table_schema, table_name, ordinal_position
		`);
        return (0, sqlCompletionSchema_1.buildSqlCompletionSchema)(result.rows);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
//# sourceMappingURL=sqlCompletionSchema.js.map