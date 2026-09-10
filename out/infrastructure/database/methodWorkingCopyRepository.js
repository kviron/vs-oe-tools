"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMethodWorkingCopyInfo = getMethodWorkingCopyInfo;
const node_os_1 = require("node:os");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
const projectDatabaseSession_1 = require("./projectDatabaseSession");
/** Resolves the physical package file which owns a database method. */
async function getMethodWorkingCopyInfo(methodId) {
    return (0, projectDatabaseSession_1.withProjectDatabaseSession)(async ({ client, options }) => {
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT file.filename, groups.path AS group_path, package.packagename AS package_name
			 FROM abstract AS object
			 JOIN sysfile AS file ON file.id = object.sysfile
			 LEFT JOIN sysgroups AS groups ON groups.id = file.sysgroup
			 LEFT JOIN syspackages AS package ON package.id = groups.package
			 WHERE object.id = $1`,
            values: [methodId],
            source: `Поиск локального SVN-файла метода ${methodId}`,
            database: options.database,
        });
        const row = result.rows[0];
        if (!row?.filename) {
            throw new Error(`Для метода ${methodId} не найден связанный sysfile.`);
        }
        const relativePath = [row.package_name, row.group_path, row.filename].filter(Boolean).join('\\');
        const tune = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT pathtopackages
			 FROM packagestune
			 WHERE upper(computername) = upper($1)
			   AND NULLIF(trim(pathtopackages), '') IS NOT NULL
			 LIMIT 1`,
            values: [(0, node_os_1.hostname)()],
            source: `Поиск базы пакетов для компьютера ${(0, node_os_1.hostname)()}`,
            database: options.database,
        }).catch(() => undefined);
        return { fileName: row.filename, relativePath, packagesRoot: tune?.rows[0]?.pathtopackages };
    });
}
//# sourceMappingURL=methodWorkingCopyRepository.js.map