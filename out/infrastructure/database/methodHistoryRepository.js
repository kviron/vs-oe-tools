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
exports.getMethodHistory = getMethodHistory;
const pg_1 = require("pg");
const iconv = __importStar(require("iconv-lite"));
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
const methodHistoryParsing_1 = require("./methodHistoryParsing");
async function getMethodHistory(methodId) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const userTable = await findUserTable(client, options.database).catch(() => undefined);
        const userJoin = userTable ? buildUserJoin(userTable) : '';
        const userColumns = userTable ? ', to_jsonb(users) AS userdata' : '';
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `SELECT to_jsonb(log_entry) AS data${userColumns}
			 FROM logcchangedobject AS log_entry
			 ${userJoin}
			 WHERE log_entry.objid = $1 AND log_entry.objclassid = 5
			 ORDER BY log_entry.changedate DESC`,
            values: [methodId],
            source: `История изменений метода ${methodId}`,
            database: options.database,
        });
        return result.rows
            .map((row, index) => toHistoryEntry(row.data, index, row.userdata))
            .filter((entry) => entry !== undefined);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
function toHistoryEntry(data, index, userData) {
    const oldValues = decodeText(readValue(data, 'oldvalues'));
    const newValues = decodeText(readValue(data, 'newvalues'));
    const oldCode = (0, methodHistoryParsing_1.extractCodeFromChangeValues)(oldValues);
    const newCode = (0, methodHistoryParsing_1.extractCodeFromChangeValues)(newValues);
    if (oldCode === undefined && newCode === undefined) {
        return undefined;
    }
    return {
        revision: readText(data, 'id', 'logid', 'transactionid'),
        changedAt: new Date(readText(data, 'changedate') || 0),
        userId: readText(data, 'userid') || 'неизвестен',
        userName: decodeText(readValue(userData ?? {}, 'username', 'fullname', 'name', 'fio')),
        loginName: decodeText(readValue(userData ?? {}, 'loginname', 'login', 'userlogin')),
        computerName: readText(data, 'computername'),
        comment: decodeText(readValue(data, 'transactioncomment')),
        oldCode: oldCode ?? '',
        newCode: newCode ?? '',
    };
}
async function findUserTable(client, database) {
    const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT table_schema, table_name, array_agg(column_name) AS columns
		 FROM information_schema.columns
		 WHERE lower(table_name) = 'users'
		 GROUP BY table_schema, table_name
		 HAVING bool_or(lower(column_name) = 'id')
		 ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema
		 LIMIT 1`,
        source: 'Поиск данных пользователей для истории кода',
        database,
    });
    return result.rows[0];
}
function buildUserJoin(table) {
    const idColumn = table.columns.find(column => column.toLocaleLowerCase('en-US') === 'id') ?? 'id';
    return `LEFT JOIN ${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)} AS users ON users.${quoteIdentifier(idColumn)} = log_entry.userid`;
}
function quoteIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
function readValue(row, ...names) {
    const values = new Map(Object.entries(row).map(([key, value]) => [key.toLocaleLowerCase('en-US'), value]));
    for (const name of names) {
        const value = values.get(name.toLocaleLowerCase('en-US'));
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    return undefined;
}
function readText(row, ...names) {
    const value = readValue(row, ...names);
    return value === undefined ? '' : String(value);
}
function decodeText(value) {
    if (Buffer.isBuffer(value)) {
        return iconv.decode(value, 'win1251');
    }
    const text = value === undefined || value === null ? '' : String(value);
    const bytea = text.match(/^\\x([\da-f]+)$/i);
    return bytea && bytea[1].length % 2 === 0 ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251') : text;
}
//# sourceMappingURL=methodHistoryRepository.js.map