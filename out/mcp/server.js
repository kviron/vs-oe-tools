"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const promises_1 = require("node:fs/promises");
const databaseConfig_1 = require("./databaseConfig");
const readOnlyQuery_1 = require("./readOnlyQuery");
const sourceContent_1 = require("./sourceContent");
const classAttributes_1 = require("./classAttributes");
const methodResolution_1 = require("./methodResolution");
const objectSearch_1 = require("../core/objectSearch");
const navigationInfo_1 = require("../core/navigationInfo");
// The SDK currently publishes declarations that require DOM and NodeNext types.
// Runtime imports keep this standalone entrypoint compatible with the extension's Node16 tsconfig.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');
const workspacePath = readArgument('--workspace');
const databaseRole = readRoleArgument();
const logsPath = readOptionalArgument('--logs');
const navigationInfoPath = readOptionalArgument('--navigation-info') ?? (0, navigationInfo_1.getNavigationInfoPath)(workspacePath);
const server = new McpServer({ name: 'vc-ve-tools-database', version: '0.10.0' }, {
    instructions: [
        'East Express method names are stored separately in method cards and must never be included in method source code. Method source contains the body only: do not add procedure/function declarations containing the method name.',
        'Use focused read-only tools before query_readonly. Resolve unknown calls with method resolution and object search tools, then follow returned stable IDs.',
        'For VS Code navigation, use open_method for the source editor and reveal_method_in_class to select a method on the owning class Methods tab. Never use cursor or screen automation for these actions.',
        'Database access is read-only. Include relevant object IDs in analysis so navigation can continue.',
    ].join(' '),
});
server.registerTool('lookup_object_by_id', {
    description: 'Identify any East Express object by an otherwise unknown numeric ID. Returns its concrete kind, meta-class, owner and package context.',
    inputSchema: { id: z.number().int().positive().describe('Unknown East Express object ID') },
    annotations: { readOnlyHint: true },
}, async ({ id }) => databaseToolResult(async () => {
    const rows = await queryDatabaseRaw(`${objectSearch_1.databaseObjectSearchSelect} WHERE object.id = $1`, [id]);
    return { found: rows.length === 1, object: rows[0] ? (0, objectSearch_1.mapDatabaseObject)(rows[0]) : null };
}));
server.registerTool('search_database_objects', {
    description: 'Search East Express objects across Abstract, classes, methods and attributes by exact ID or partial name.',
    inputSchema: {
        query: z.string().min(1).describe('Numeric object ID or full/partial object name'),
        limit: z.number().int().min(1).max(500).optional().describe('Maximum results, default 100'),
    },
    annotations: { readOnlyHint: true },
}, async ({ query, limit }) => databaseToolResult(async () => {
    const trimmed = query.trim();
    const numericId = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
    const rows = await queryDatabaseRaw(`${objectSearch_1.databaseObjectSearchSelect}
		 WHERE ($1::bigint IS NOT NULL AND object.id = $1) OR object.name ILIKE $2
		 ORDER BY CASE WHEN object.id = $1 THEN 0 WHEN lower(object.name) = lower($3) THEN 1 ELSE 2 END,
		          object.name, object.id
		 LIMIT $4`, [numericId, numericId === null ? `%${trimmed}%` : trimmed, trimmed, limit ?? 100]);
    return { query: trimmed, count: rows.length, objects: rows.map(objectSearch_1.mapDatabaseObject) };
}));
server.registerTool('search_classes', {
    description: 'Find East Express classes by name, title, alias, or numeric ID. Returns stable class IDs that can be passed to VS Code navigation tools.',
    inputSchema: {
        query: z.string().min(1).describe('Full or partial class name, title, alias, or class ID'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum matches to return, default 20'),
    },
    annotations: { readOnlyHint: true },
}, async ({ query, limit }) => databaseToolResult(async () => {
    const rows = await queryDatabase(`SELECT class.id, class.name, class.title, class.aliases, class.seniorid
		   FROM classes AS class
		  WHERE class.id::text = $1
		     OR class.name ILIKE $2
		     OR COALESCE(class.title::text, '') ILIKE $2
		     OR COALESCE(class.aliases::text, '') ILIKE $2
		  ORDER BY CASE WHEN lower(class.name) = lower($1) THEN 0 ELSE 1 END,
		           class.name
		  LIMIT $3`, [query.trim(), `%${query.trim()}%`, limit ?? 20]);
    return { query, count: rows.length, classes: rows };
}));
server.registerTool('get_class_details', {
    description: 'Read the full database card for an East Express class by its ID.',
    inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
    annotations: { readOnlyHint: true },
}, async ({ classId }) => databaseToolResult(async () => {
    const rows = await queryDatabase(`SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
		   FROM classes AS class
		   LEFT JOIN classes AS child ON child.id = class.childclassid
		   LEFT JOIN classes AS parent ON parent.id = class.parentclassid
		  WHERE class.id = $1`, [classId]);
    return { found: rows.length === 1, class: rows[0] ?? null };
}));
server.registerTool('get_class_attributes', {
    description: 'Read East Express class attributes for code analysis, including logical type, physical database field, owner and inheritance depth.',
    inputSchema: {
        classId: z.number().int().positive().describe('Class ID returned by search_classes'),
        includeInherited: z.boolean().optional().describe('Include inherited attributes, default true'),
        includeShadowed: z.boolean().optional().describe('Include overridden ancestor definitions, default false'),
        query: z.string().optional().describe('Optional case-insensitive filter by attribute name, ID, type or physical database field'),
        limit: z.number().int().min(1).max(500).optional().describe('Maximum attributes to return, default 200'),
    },
    annotations: { readOnlyHint: true },
}, async ({ classId, includeInherited, includeShadowed, query, limit }) => databaseToolResult(async () => {
    const classRows = await queryDatabaseRaw('SELECT id, name FROM classes WHERE id = $1', [classId]);
    const selectedClass = classRows[0];
    if (!selectedClass) {
        throw new Error(`Class ${classId} was not found.`);
    }
    const tableRows = await queryDatabaseRaw(attributeTableDiscoveryQuery, []);
    const table = tableRows[0];
    if (!table) {
        throw new Error('A class attribute table was not found in the database schema.');
    }
    const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
    if (!ownerColumn) {
        throw new Error('The class attribute table does not contain an owner column.');
    }
    const orderColumn = ['ord', 'line', 'linenumber', 'name'].find(column => table.columns.includes(column)) ?? 'id';
    const tableName = `${(0, classAttributes_1.quotePostgresIdentifier)(table.table_schema)}.${(0, classAttributes_1.quotePostgresIdentifier)(table.table_name)}`;
    const rows = await queryDatabaseRaw(createClassAttributesQuery(tableName, ownerColumn, orderColumn, includeInherited !== false), [classId]);
    let attributes = rows.map(row => toMcpClassAttribute(row));
    attributes = (0, classAttributes_1.selectVisibleAttributes)(attributes, includeShadowed === true);
    const normalizedQuery = query?.trim().toLocaleLowerCase('ru');
    if (normalizedQuery) {
        attributes = attributes.filter(attribute => [attribute.id, attribute.name, attribute.type, attribute.dbFieldName, attribute.ownerClassName]
            .some(value => value.toLocaleLowerCase('ru').includes(normalizedQuery)));
    }
    attributes.sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.depth - right.depth);
    const maximum = limit ?? 200;
    return {
        classId: String(selectedClass.id),
        className: selectedClass.name,
        includeInherited: includeInherited !== false,
        includeShadowed: includeShadowed === true,
        table: `${table.table_schema}.${table.table_name}`,
        totalCount: attributes.length,
        count: Math.min(attributes.length, maximum),
        truncated: attributes.length > maximum,
        attributes: attributes.slice(0, maximum),
    };
}));
server.registerTool('get_attribute_details', {
    description: 'Read the complete database record of one East Express class attribute by ID, including its owner, logical type and physical database field.',
    inputSchema: {
        attributeId: z.number().int().positive().describe('Attribute ID returned by get_class_attributes'),
    },
    annotations: { readOnlyHint: true },
}, async ({ attributeId }) => databaseToolResult(async () => {
    const tableRows = await queryDatabaseRaw(attributeTableDiscoveryQuery, []);
    const table = tableRows[0];
    if (!table) {
        throw new Error('A class attribute table was not found in the database schema.');
    }
    const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
    if (!ownerColumn) {
        throw new Error('The class attribute table does not contain an owner column.');
    }
    const tableName = `${(0, classAttributes_1.quotePostgresIdentifier)(table.table_schema)}.${(0, classAttributes_1.quotePostgresIdentifier)(table.table_name)}`;
    const typeJoin = table.columns.includes('attrtype') ? 'LEFT JOIN classes AS attribute_type ON attribute_type.id = attribute.attrtype' : '';
    const typeColumn = table.columns.includes('attrtype') ? ', attribute_type.name AS attributetypename' : ", ''::text AS attributetypename";
    const rows = await queryDatabaseRaw(`SELECT to_jsonb(attribute) AS data, owner.id AS ownerclassid, owner.name AS ownerclassname, 0 AS depth${typeColumn}
		 FROM ${tableName} AS attribute
		 LEFT JOIN classes AS owner ON owner.id = attribute.${(0, classAttributes_1.quotePostgresIdentifier)(ownerColumn)}
		 ${typeJoin}
		 WHERE attribute.id = $1`, [attributeId]);
    const row = rows[0];
    if (!row) {
        throw new Error(`Attribute ${attributeId} was not found.`);
    }
    return {
        found: true,
        table: `${table.table_schema}.${table.table_name}`,
        attribute: { ...toMcpClassAttribute(row), attributeTypeName: row.attributetypename },
    };
}));
server.registerTool('search_methods', {
    description: 'Find East Express methods by name or numeric ID, optionally within one class. Returns method IDs that can be opened by the VS Code navigation tool.',
    inputSchema: {
        query: z.string().min(1).describe('Full or partial method name, or method ID'),
        classId: z.number().int().positive().optional().describe('Optional owning class ID'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum matches to return, default 20'),
    },
    annotations: { readOnlyHint: true },
}, async ({ query, classId, limit }) => databaseToolResult(async () => {
    const rows = await queryDatabase(`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname
		   FROM methods AS method
		   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		  WHERE (method.id::text = $1 OR method.name ILIKE $2)
		    AND ($3::bigint IS NULL OR method.seniorid = $3)
		  ORDER BY CASE WHEN lower(method.name) = lower($1) THEN 0 ELSE 1 END,
		           method.name,
		           method.id
		  LIMIT $4`, [query.trim(), `%${query.trim()}%`, classId ?? null, limit ?? 20]);
    return { query, classId: classId ?? null, count: rows.length, methods: rows };
}));
server.registerTool('resolve_method_reference', {
    description: 'Resolve a method call found in East Express source code. Ranks exact-name candidates using the caller class, inheritance, an optional class/object qualifier and optional argument count.',
    inputSchema: {
        callerMethodId: z.number().int().positive().describe('ID of the method whose source contains the call'),
        methodName: z.string().min(1).describe('Exact called method or function name without parentheses'),
        qualifier: z.string().min(1).optional().describe('Optional qualifier from ClassName.Method or objectAttribute.Method'),
        argumentCount: z.number().int().min(0).max(100).optional().describe('Optional number of call arguments for overload ranking'),
    },
    annotations: { readOnlyHint: true },
}, async ({ callerMethodId, methodName, qualifier, argumentCount }) => databaseToolResult(async () => {
    const callers = await queryDatabaseRaw(`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname
		 FROM methods AS method LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		 WHERE method.id = $1`, [callerMethodId]);
    const caller = callers[0];
    if (!caller) {
        throw new Error(`Caller method ${callerMethodId} was not found.`);
    }
    const currentChain = await loadClassChain([caller.classid]);
    const qualifierRoots = qualifier ? await resolveQualifierClassIds(qualifier, currentChain.map(item => item.id)) : [];
    const qualifierChain = qualifierRoots.length > 0 ? await loadClassChain(qualifierRoots) : [];
    const candidateRows = await queryDatabaseRaw(`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname, to_jsonb(method) AS data
		 FROM methods AS method LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		 WHERE lower(method.name) = lower($1)
		 ORDER BY method.id LIMIT 100`, [methodName.trim()]);
    const candidates = candidateRows.map(row => ({
        methodId: String(row.id),
        methodName: row.name,
        classId: String(row.classid),
        className: row.classname ?? '',
        signature: (0, sourceContent_1.decodeSourceValue)((0, classAttributes_1.readAttributeValue)(row.data, 'signature', 'methsignature', 'parameters', 'params')),
    }));
    const resolution = (0, methodResolution_1.resolveMethodCandidates)(candidates, new Map(currentChain.map(item => [String(item.id), item.depth])), new Map(qualifierChain.map(item => [String(item.id), item.depth])), Boolean(qualifier), argumentCount);
    return {
        caller: { methodId: String(caller.id), methodName: caller.name, classId: String(caller.classid), className: caller.classname },
        reference: { methodName: methodName.trim(), qualifier: qualifier?.trim() ?? null, argumentCount: argumentCount ?? null },
        qualifierClassIds: qualifierRoots.map(String),
        ...resolution,
        nextTool: resolution.selected ? { name: 'get_method_source', arguments: { methodId: resolution.selected.methodId } } : null,
    };
}));
const sourceExcerptSchema = {
    startLine: z.number().int().min(1).optional().describe('First source line to return, default 1'),
    maxLines: z.number().int().min(1).max(sourceContent_1.maximumSourceLineLimit).optional().describe(`Maximum source lines to return, default ${sourceContent_1.defaultSourceLineLimit}`),
};
server.registerTool('get_method_source', {
    description: 'Read decoded Windows-1251 source code of an East Express method for analysis. Returns numbered lines and pagination metadata.',
    inputSchema: {
        methodId: z.number().int().positive().describe('Method ID returned by search_methods'),
        ...sourceExcerptSchema,
    },
    annotations: { readOnlyHint: true },
}, async ({ methodId, startLine, maxLines }) => databaseToolResult(async () => {
    const rows = await queryDatabaseRaw(`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname,
		        method.methtype, method.code, pg_typeof(method.code)::text AS codetype
		   FROM methods AS method
		   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		  WHERE method.id = $1`, [methodId]);
    const method = rows[0];
    if (!method) {
        throw new Error(`Method ${methodId} was not found.`);
    }
    return {
        found: true,
        methodId: String(method.id),
        name: method.name,
        classId: String(method.classid),
        className: method.classname,
        methodType: method.methtype,
        codeType: method.codetype,
        source: (0, sourceContent_1.createSourceExcerpt)((0, sourceContent_1.decodeSourceValue)(method.code), startLine, maxLines),
    };
}));
server.registerTool('get_dfm_source', {
    description: 'Read the decoded Windows-1251 DFM source owned by an East Express class. Returns numbered lines and pagination metadata.',
    inputSchema: {
        classId: z.number().int().positive().describe('Class ID returned by search_classes'),
        ...sourceExcerptSchema,
    },
    annotations: { readOnlyHint: true },
}, async ({ classId, startLine, maxLines }) => databaseToolResult(async () => {
    const rows = await queryDatabaseRaw(dfmSourceQuery, [classId]);
    const dfm = rows[0];
    if (!dfm) {
        throw new Error(`Class ${classId} does not have its own DFM source.`);
    }
    return { found: true, ...formatDfmSource(dfm, startLine, maxLines) };
}));
server.registerTool('get_dfm_inheritance', {
    description: 'Read decoded DFM sources across the inheritance chain of an East Express class, ordered from ancestor to selected class.',
    inputSchema: {
        classId: z.number().int().positive().describe('Class ID returned by search_classes'),
        ...sourceExcerptSchema,
    },
    annotations: { readOnlyHint: true },
}, async ({ classId, startLine, maxLines }) => databaseToolResult(async () => {
    const rows = await queryDatabaseRaw(dfmInheritanceQuery, [classId]);
    return {
        classId: String(classId),
        count: rows.length,
        sources: rows.map(row => ({ depth: row.depth, ...formatDfmSource(row, startLine, maxLines) })),
    };
}));
server.registerTool('reveal_class', {
    description: 'Reveal an East Express class in the vc-ve-tools Explorer without using mouse or keyboard automation. First resolve the class ID with search_classes.',
    inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
    annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ classId }) => navigationToolResult('reveal_class', classId));
server.registerTool('open_class', {
    description: 'Reveal an East Express class in the vc-ve-tools Explorer and open its class card in VS Code without cursor automation. First resolve the class ID with search_classes.',
    inputSchema: { classId: z.number().int().positive().describe('Class ID returned by search_classes') },
    annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ classId }) => navigationToolResult('open_class', classId));
server.registerTool('open_method', {
    description: 'Open an East Express method in the VS Code virtual editor without cursor automation. First resolve the method ID with search_methods.',
    inputSchema: { methodId: z.number().int().positive().describe('Method ID returned by search_methods') },
    annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ methodId }) => navigationToolResult('open_method', methodId));
server.registerTool('reveal_method_in_class', {
    description: 'Open the owning class card in the vc-ve-tools Explorer, switch to its Methods tab, select the exact method row, and scroll it into view without mouse or cursor automation.',
    inputSchema: { methodId: z.number().int().positive().describe('Method ID returned by search_methods') },
    annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ methodId }) => {
    const rows = await queryDatabaseRaw('SELECT seniorid AS classid FROM methods WHERE id = $1', [methodId]);
    const classId = rows[0]?.classid;
    if (!classId) {
        return { content: [{ type: 'text', text: `Method ${methodId} was not found.` }], isError: true };
    }
    return navigationToolResult('reveal_method', methodId, classId);
});
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
server.registerTool('get_recent_extension_errors', {
    description: 'Read recent vc-ve-tools errors. Use this first when diagnosing an extension or database failure.',
    inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('Maximum errors to return, default 30') },
    annotations: { readOnlyHint: true },
}, async ({ limit }) => logToolResult('error', limit ?? 30));
server.registerTool('get_extension_logs', {
    description: 'Read recent structured vc-ve-tools diagnostic events.',
    inputSchema: {
        level: z.enum(['info', 'warning', 'error']).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum records to return, default 50'),
    },
    annotations: { readOnlyHint: true },
}, async ({ level, limit }) => logToolResult(level, limit ?? 50));
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
function readOptionalArgument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
async function logToolResult(level, limit) {
    if (!logsPath) {
        return { content: [{ type: 'text', text: 'Extension log path is not configured.' }], isError: true };
    }
    try {
        const content = await (0, promises_1.readFile)(logsPath, 'utf8');
        const records = content.split(/\r?\n/).filter(Boolean).flatMap(line => {
            try {
                return [JSON.parse(line)];
            }
            catch {
                return [];
            }
        });
        const filtered = records.filter(record => !level || record.level === level).slice(-limit).reverse();
        return {
            content: [{ type: 'text', text: JSON.stringify({ count: filtered.length, records: filtered }, null, 2) }],
            structuredContent: { count: filtered.length, records: filtered },
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return { content: [{ type: 'text', text: JSON.stringify({ count: 0, records: [] }) }], structuredContent: { count: 0, records: [] } };
        }
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
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
async function queryDatabase(text, values) {
    return (await queryDatabaseRaw(text, values)).map(normalizeRow);
}
async function queryDatabaseRaw(text, values) {
    const options = await (0, databaseConfig_1.loadMcpDatabaseOptions)(workspacePath, databaseRole);
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools-mcp', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        await client.query('BEGIN READ ONLY');
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query("SET LOCAL lock_timeout = '2s'");
        const result = await client.query(text, values);
        return result.rows;
    }
    finally {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.end().catch(() => undefined);
    }
}
async function loadClassChain(rootIds) {
    if (rootIds.length === 0) {
        return [];
    }
    return queryDatabaseRaw(`WITH RECURSIVE class_chain AS (
		  SELECT class.id, class.name, class.seniorid, 0 AS depth, ARRAY[class.id] AS path
		  FROM classes AS class WHERE class.id = ANY($1::bigint[])
		  UNION ALL
		  SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
		  FROM classes AS parent JOIN class_chain AS chain ON parent.id = chain.seniorid
		  WHERE NOT parent.id = ANY(chain.path)
		)
		SELECT id, name, min(depth)::integer AS depth
		FROM class_chain GROUP BY id, name ORDER BY min(depth), name`, [rootIds]);
}
async function resolveQualifierClassIds(qualifier, callerClassIds) {
    const normalized = qualifier.trim();
    const direct = await queryDatabaseRaw(`SELECT id FROM classes
		 WHERE lower(name) = lower($1)
		    OR COALESCE(aliases::text, '') ILIKE $2
		 ORDER BY CASE WHEN lower(name) = lower($1) THEN 0 ELSE 1 END, id
		 LIMIT 20`, [normalized, `%${normalized}%`]);
    if (direct.length > 0) {
        return [...new Set(direct.map(row => row.id))];
    }
    const tables = await queryDatabaseRaw(attributeTableDiscoveryQuery, []);
    const table = tables[0];
    if (!table || !table.columns.includes('attrtype')) {
        return [];
    }
    const ownerColumn = ['seniorid', 'classid', 'ownerid'].find(column => table.columns.includes(column));
    if (!ownerColumn) {
        return [];
    }
    const tableName = `${(0, classAttributes_1.quotePostgresIdentifier)(table.table_schema)}.${(0, classAttributes_1.quotePostgresIdentifier)(table.table_name)}`;
    const attributeTypes = await queryDatabaseRaw(`SELECT DISTINCT attribute.attrtype AS classid
		 FROM ${tableName} AS attribute
		 WHERE attribute.${(0, classAttributes_1.quotePostgresIdentifier)(ownerColumn)} = ANY($1::bigint[])
		   AND lower(attribute.name) = lower($2)
		   AND attribute.attrtype IS NOT NULL
		 LIMIT 20`, [callerClassIds, normalized]);
    return [...new Set(attributeTypes.map(row => row.classid))];
}
const attributeTableDiscoveryQuery = `SELECT table_schema, table_name, array_agg(lower(column_name)) AS columns
	FROM information_schema.columns
	WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
	GROUP BY table_schema, table_name
	HAVING lower(table_name) LIKE '%attr%'
	   AND bool_or(lower(column_name) = 'id')
	   AND bool_or(lower(column_name) = 'name')
	   AND bool_or(lower(column_name) IN ('seniorid', 'classid', 'ownerid'))
	ORDER BY CASE lower(table_name)
	  WHEN 'attributes' THEN 0 WHEN 'classattributes' THEN 1 WHEN 'objattributes' THEN 2 ELSE 3 END,
	  table_name`;
function createClassAttributesQuery(tableName, ownerColumn, orderColumn, includeInherited) {
    const owner = (0, classAttributes_1.quotePostgresIdentifier)(ownerColumn);
    const order = (0, classAttributes_1.quotePostgresIdentifier)(orderColumn);
    if (!includeInherited) {
        return `SELECT to_jsonb(attribute) AS data, class.id AS ownerclassid, class.name AS ownerclassname, 0 AS depth
			FROM ${tableName} AS attribute
			JOIN classes AS class ON class.id = attribute.${owner}
			WHERE attribute.${owner} = $1
			ORDER BY attribute.${order} NULLS LAST, attribute.id`;
    }
    return `WITH RECURSIVE class_chain AS (
		SELECT class.id, class.seniorid, class.name, 0 AS depth, ARRAY[class.id] AS path
		FROM classes AS class WHERE class.id = $1
		UNION ALL
		SELECT parent.id, parent.seniorid, parent.name, chain.depth + 1, chain.path || parent.id
		FROM classes AS parent JOIN class_chain AS chain ON parent.id = chain.seniorid
		WHERE NOT parent.id = ANY(chain.path)
	)
	SELECT to_jsonb(attribute) AS data, chain.id AS ownerclassid, chain.name AS ownerclassname, chain.depth
	FROM class_chain AS chain
	JOIN ${tableName} AS attribute ON attribute.${owner} = chain.id
	ORDER BY chain.depth, attribute.${order} NULLS LAST, attribute.id`;
}
function toMcpClassAttribute(row) {
    return {
        id: (0, classAttributes_1.readAttributeValue)(row.data, 'id'),
        name: (0, classAttributes_1.readAttributeValue)(row.data, 'name'),
        ownerClassId: String(row.ownerclassid),
        ownerClassName: row.ownerclassname,
        depth: row.depth,
        inherited: row.depth > 0,
        type: (0, classAttributes_1.readAttributeValue)(row.data, 'type', 'typename', 'attrtype', 'attributetype', 'kind'),
        dbFieldName: (0, classAttributes_1.readAttributeValue)(row.data, 'dbfieldname', 'dbfield', 'fieldname', 'columnname'),
        data: normalizeAttributeRecord(row.data),
    };
}
function normalizeAttributeRecord(data) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [
        key,
        typeof value === 'string' && /^\\x[\da-f]+$/i.test(value) ? (0, sourceContent_1.decodeSourceValue)(value) : normalizeValue(value),
    ]));
}
const dfmSourceQuery = `WITH RECURSIVE class_chain AS (
	SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
	UNION ALL
	SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
	FROM classes parent JOIN class_chain chain ON parent.id = chain.seniorid
	WHERE NOT parent.id = ANY(chain.path)
), dfm_attribute AS (
	SELECT attribute.id, chain.depth
	FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
	WHERE upper(attribute.name) = 'DFM'
	ORDER BY chain.depth LIMIT 1
)
SELECT class.id AS classid, class.name AS classname, attribute.id AS attrid,
	value.id AS valueid, value.name AS valuename, value.defvalue,
	pg_typeof(value.defvalue)::text AS valuetype
FROM classes class CROSS JOIN dfm_attribute attribute
JOIN dfltvalues value ON value.seniorid = class.id AND value.attrid = attribute.id
WHERE class.id = $1`;
const dfmInheritanceQuery = `WITH RECURSIVE class_chain AS (
	SELECT id, name, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
	UNION ALL
	SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
	FROM classes parent JOIN class_chain chain ON parent.id = chain.seniorid
	WHERE NOT parent.id = ANY(chain.path)
), dfm_attributes AS (
	SELECT attribute.id FROM class_chain chain
	JOIN attributes attribute ON attribute.seniorid = chain.id
	WHERE upper(attribute.name) = 'DFM'
)
SELECT chain.id AS classid, chain.name AS classname, value.attrid,
	value.id AS valueid, value.name AS valuename, value.defvalue,
	pg_typeof(value.defvalue)::text AS valuetype, chain.depth
FROM class_chain chain
JOIN dfltvalues value ON value.seniorid = chain.id
WHERE value.attrid IN (SELECT id FROM dfm_attributes)
ORDER BY chain.depth DESC`;
function formatDfmSource(row, startLine, maxLines) {
    return {
        classId: String(row.classid),
        className: row.classname,
        attributeId: String(row.attrid),
        valueId: String(row.valueid),
        valueName: row.valuename ?? 'DFM',
        valueType: row.valuetype,
        source: (0, sourceContent_1.createSourceExcerpt)((0, sourceContent_1.decodeSourceValue)(row.defvalue), startLine, maxLines),
    };
}
async function databaseToolResult(load) {
    try {
        const result = await load();
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    }
    catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
}
async function navigationToolResult(action, id, classId) {
    try {
        const connection = JSON.parse(await (0, promises_1.readFile)(navigationInfoPath, 'utf8'));
        if (typeof connection.url !== 'string' || typeof connection.token !== 'string') {
            throw new Error('VS Code navigation bridge information is invalid.');
        }
        const response = await fetch(connection.url, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ action, id, classId }),
            signal: AbortSignal.timeout(10_000),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(typeof result.error === 'string' ? result.error : `Navigation bridge returned HTTP ${response.status}.`);
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const message = error.code === 'ENOENT'
            ? `VS Code navigation bridge is not running for workspace ${workspacePath}. Open this workspace in VS Code with vc-ve-tools enabled.`
            : `VS Code navigation failed: ${detail}`;
        return { content: [{ type: 'text', text: message }], isError: true };
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=server.js.map