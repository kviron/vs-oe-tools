"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPackages = loadPackages;
exports.loadPackageTree = loadPackageTree;
exports.loadPackageFileContent = loadPackageFileContent;
const pg_1 = require("pg");
const iconv = __importStar(require("iconv-lite"));
const packageTree_1 = require("../../features/packages/packageTree");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
async function loadPackages() {
    return withDatabase(async (client, database) => {
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT id::text, packagename FROM syspackages ORDER BY lower(packagename), id`,
            source: 'Пакеты проводника', database,
        });
        return result.rows.map(row => ({ id: Number(row.id), name: decodeText(row.packagename) }));
    });
}
async function loadPackageTree(packageId) {
    return withDatabase(async (client, database) => {
        const packageResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT id::text, packagename FROM syspackages WHERE id = $1`, values: [packageId],
            source: `Пакет ${packageId}`, database,
        });
        const packageRow = packageResult.rows[0];
        if (!packageRow) {
            throw new Error(`Пакет ${packageId} не найден.`);
        }
        const groups = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT id::text, groupname, path FROM sysgroups WHERE package = $1 ORDER BY lower(path), lower(groupname), id`,
            values: [packageId], source: `Группы пакета ${decodeText(packageRow.packagename)}`, database,
        });
        const files = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT file.id::text, file.filename, file.sysgroup::text,
			              count(object.id)::text AS objectcount
			       FROM sysfile AS file
			       JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			       LEFT JOIN abstract AS object ON object.sysfile = file.id
			       WHERE file_group.package = $1
			       GROUP BY file.id, file.filename, file.sysgroup
			       ORDER BY lower(file.filename), file.id`,
            values: [packageId], source: `Файлы пакета ${decodeText(packageRow.packagename)}`, database,
        });
        return (0, packageTree_1.buildPackageTree)(Number(packageRow.id), decodeText(packageRow.packagename), groups.rows.map(row => ({ ...row, groupname: decodeText(row.groupname), path: row.path === null ? null : decodeText(row.path) })), files.rows.map(row => ({ ...row, filename: decodeText(row.filename) })));
    });
}
async function loadPackageFileContent(fileId) {
    return withDatabase(async (client, database) => {
        const fileResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT file.id::text, file.filename, file_group.path AS grouppath, package.packagename
			       FROM sysfile AS file
			       JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
			       JOIN syspackages AS package ON package.id = file_group.package
			       WHERE file.id = $1`,
            values: [fileId], source: `Файл пакета ${fileId}`, database,
        });
        const file = fileResult.rows[0];
        if (!file) {
            throw new Error(`Файл пакета ${fileId} не найден.`);
        }
        const objects = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT object.id::text, object.name, object.seniorid::text, object.classid::text,
			              meta_class.name AS classname,
			              (entity_class.id IS NOT NULL) AS isclass,
			              (method.id IS NOT NULL) AS ismethod,
			              (attribute.id IS NOT NULL) AS isattribute
			       FROM abstract AS object
			       LEFT JOIN classes AS meta_class ON meta_class.id = object.classid
			       LEFT JOIN classes AS entity_class ON entity_class.id = object.id
			       LEFT JOIN methods AS method ON method.id = object.id
			       LEFT JOIN attributes AS attribute ON attribute.id = object.id
			       WHERE object.sysfile = $1
			       ORDER BY object.ord NULLS LAST, lower(object.name), object.id`,
            values: [fileId], source: `Содержимое файла ${decodeText(file.filename)}`, database,
        });
        return {
            fileId: Number(file.id), fileName: decodeText(file.filename), packageName: decodeText(file.packagename),
            groupPath: decodeText(file.grouppath ?? ''), objects: buildContentTree(objects.rows),
        };
    });
}
function buildContentTree(rows) {
    const nodes = new Map();
    for (const row of rows) {
        const id = Number(row.id);
        nodes.set(id, {
            id, name: decodeText(row.name) || `Объект ${id}`, classId: Number(row.classid),
            className: decodeText(row.classname ?? ''), parentId: row.seniorid === null ? undefined : Number(row.seniorid),
            kind: objectKind(row), children: [],
        });
    }
    const roots = [];
    for (const node of nodes.values()) {
        const parent = node.parentId === undefined ? undefined : nodes.get(node.parentId);
        (parent?.children ?? roots).push(node);
    }
    return roots;
}
function objectKind(row) {
    if (row.ismethod) {
        return 'method';
    }
    if (row.isattribute) {
        return 'attribute';
    }
    if (row.isclass) {
        return 'class';
    }
    const value = (row.classname ?? '').toLocaleLowerCase('ru').replace(/\s/g, '');
    if (value.includes('жизненныйцикл')) {
        return 'lifecycle';
    }
    if (value.includes('журнал')) {
        return 'journal';
    }
    if (value.includes('список')) {
        return 'list';
    }
    return 'object';
}
function decodeText(value) {
    const bytea = value.match(/^\\x([\da-f]+)$/i);
    return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : value;
}
async function withDatabase(action) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        return await action(client, options.database);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
//# sourceMappingURL=packageExplorerRepository.js.map