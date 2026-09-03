"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMethodWorkingCopyInfo = getMethodWorkingCopyInfo;
const pg_1 = require("pg");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
/** Resolves the physical package file which owns a database method. */
async function getMethodWorkingCopyInfo(methodId) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT file.filename, groups.path AS group_path
			 FROM abstract AS object
			 JOIN sysfile AS file ON file.id = object.sysfile
			 LEFT JOIN sysgroups AS groups ON groups.id = file.sysgroup
			 WHERE object.id = $1`,
            values: [methodId],
            source: `Поиск локального SVN-файла метода ${methodId}`,
            database: options.database,
        });
        const row = result.rows[0];
        if (!row?.filename) {
            throw new Error(`Для метода ${methodId} не найден связанный sysfile.`);
        }
        const relativePath = [row.group_path, row.filename].filter(Boolean).join('\\');
        return { fileName: row.filename, relativePath };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
//# sourceMappingURL=methodWorkingCopyRepository.js.map