"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchDatabaseObjects = searchDatabaseObjects;
const pg_1 = require("pg");
const objectSearch_1 = require("../../core/objectSearch");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
async function searchDatabaseObjects(query, limit = 100) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const trimmed = query.trim();
        const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `${objectSearch_1.databaseObjectSearchSelect}
			 WHERE ($1::bigint IS NOT NULL AND object.id = $1)
			    OR object.name ILIKE $2
			 ORDER BY CASE WHEN object.id = $1 THEN 0 WHEN lower(object.name) = lower($2) THEN 1 ELSE 2 END,
			          object.name, object.id
			 LIMIT $3`,
            values: [numericId, numericId === null ? `%${trimmed}%` : trimmed, Math.min(Math.max(limit, 1), 500)],
            source: `Поиск объектов ${trimmed}`,
            database: options.database,
        });
        return result.rows.map(objectSearch_1.mapDatabaseObject);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
//# sourceMappingURL=objectSearchRepository.js.map