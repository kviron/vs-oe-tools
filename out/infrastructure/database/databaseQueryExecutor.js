"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeMonitoredQuery = executeMonitoredQuery;
exports.serializeQueryResult = serializeQueryResult;
const sqlMonitorService_1 = require("../../features/sql-monitor/sqlMonitorService");
const resultRowLimit = 500;
const valueLengthLimit = 10_000;
async function executeMonitoredQuery(client, query) {
    const started = performance.now();
    const record = sqlMonitorService_1.sqlMonitorService.start({
        startedAt: new Date().toISOString(),
        source: query.source,
        database: query.database,
        operation: detectOperation(query.text),
        status: 'running',
        text: query.text.trim(),
        parameters: (query.values ?? []).map(normalizeValue),
        columns: [],
        rows: [],
        resultTruncated: false,
    });
    try {
        const result = await client.query(query.text, query.values);
        const serialized = serializeQueryResult(result);
        sqlMonitorService_1.sqlMonitorService.update(record.id, {
            status: 'success',
            durationMs: performance.now() - started,
            ...serialized,
        });
        return result;
    }
    catch (error) {
        sqlMonitorService_1.sqlMonitorService.update(record.id, {
            status: 'error',
            durationMs: performance.now() - started,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
function serializeQueryResult(result) {
    const results = Array.isArray(result) ? result : [result];
    const displayResult = results.at(-1);
    if (!displayResult) {
        return { rowCount: 0, columns: [], rows: [], resultTruncated: false };
    }
    const rows = displayResult.rows.slice(0, resultRowLimit).map(row => normalizeRow(row));
    return {
        rowCount: results.reduce((total, item) => total + (item.rowCount ?? item.rows.length), 0),
        columns: displayResult.fields.map(field => field.name),
        rows,
        resultTruncated: displayResult.rows.length > rows.length,
    };
}
function detectOperation(text) {
    const normalized = text.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, '').trimStart();
    const keyword = normalized.match(/^([a-z]+)/i)?.[1]?.toUpperCase();
    if (keyword === 'SELECT' || keyword === 'INSERT' || keyword === 'UPDATE' || keyword === 'DELETE') {
        return keyword;
    }
    if (keyword === 'CREATE' || keyword === 'ALTER' || keyword === 'DROP' || keyword === 'TRUNCATE') {
        return 'DDL';
    }
    return 'OTHER';
}
function normalizeRow(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}
function normalizeValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return `<binary: ${value.byteLength} bytes>`;
    }
    if (typeof value === 'object') {
        try {
            const serialized = JSON.stringify(value, (_key, nestedValue) => typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue);
            return limitValue(serialized ?? String(value));
        }
        catch {
            return '<значение недоступно для отображения>';
        }
    }
    try {
        return limitValue(String(value));
    }
    catch {
        return '<значение недоступно для отображения>';
    }
}
function limitValue(value) {
    return value.length <= valueLengthLimit ? value : `${value.slice(0, valueLengthLimit)}…`;
}
//# sourceMappingURL=databaseQueryExecutor.js.map