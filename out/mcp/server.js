"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const databaseConfig_1 = require("./databaseConfig");
const readOnlyQuery_1 = require("./readOnlyQuery");
// The SDK currently publishes declarations that require DOM and NodeNext types.
// Runtime imports keep this standalone entrypoint compatible with the extension's Node16 tsconfig.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');
const workspacePath = readArgument('--workspace');
const databaseRole = readRoleArgument();
const server = new McpServer({ name: 'vc-ve-tools-database', version: '0.1.0' });
server.registerTool('query_readonly', {
    description: 'Execute a read-only PostgreSQL SELECT/WITH/VALUES query against the current East Express project database.',
    inputSchema: {
        sql: z.string().min(1).describe('Read-only PostgreSQL query'),
        maxRows: z.number().int().min(1).max(500).optional().describe('Maximum rows to return (default 200, maximum 500)'),
    },
}, async ({ sql, maxRows }) => {
    try {
        const options = await (0, databaseConfig_1.loadMcpDatabaseOptions)(workspacePath, databaseRole);
        const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools-mcp', connectionTimeoutMillis: 5000 });
        try {
            await client.connect();
            await client.query('BEGIN READ ONLY');
            await client.query("SET LOCAL statement_timeout = '10s'");
            await client.query("SET LOCAL lock_timeout = '2s'");
            const limit = maxRows ?? readOnlyQuery_1.defaultMcpRowLimit;
            const result = await client.query((0, readOnlyQuery_1.prepareReadOnlyQuery)(sql, limit));
            const truncated = result.rows.length > limit;
            const rows = result.rows.slice(0, limit).map(normalizeRow);
            return {
                content: [{ type: 'text', text: JSON.stringify({ database: options.database, rowCount: rows.length, truncated, rows }, null, 2) }],
                structuredContent: { database: options.database, rowCount: rows.length, truncated, rows },
            };
        }
        finally {
            await client.query('ROLLBACK').catch(() => undefined);
            await client.end().catch(() => undefined);
        }
    }
    catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
});
async function main() {
    await server.connect(new StdioServerTransport());
}
function readArgument(name) {
    const index = process.argv.indexOf(name);
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    if (!value) {
        throw new Error(`Missing required argument ${name}.`);
    }
    return value;
}
function readRoleArgument() {
    const value = readArgument('--database-role');
    if (value !== 'main' && value !== 'test') {
        throw new Error('--database-role must be main or test.');
    }
    return value;
}
function normalizeRow(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}
function normalizeValue(value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return `<binary: ${value.byteLength} bytes>`;
    }
    return value;
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=server.js.map