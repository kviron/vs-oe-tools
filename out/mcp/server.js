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
const pg_1 = require("pg");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const databaseConfig_1 = require("./databaseConfig");
const readOnlyQuery_1 = require("./readOnlyQuery");
const sourceContent_1 = require("./sourceContent");
const classAttributes_1 = require("./classAttributes");
const methodResolution_1 = require("./methodResolution");
const objectSearch_1 = require("../core/objectSearch");
const navigationInfo_1 = require("../core/navigationInfo");
const classProperties_1 = require("./classProperties");
const rdboadmIni_1 = require("../infrastructure/configuration/rdboadmIni");
const databaseSelection_1 = require("../core/databaseSelection");
const queryCategory_1 = require("../features/sql-monitor/queryCategory");
// The SDK currently publishes declarations that require DOM and NodeNext types.
// Runtime imports keep this standalone entrypoint compatible with the extension's Node16 tsconfig.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');
const workspacePath = readArgument('--workspace');
const databaseRole = readRoleArgument();
let activeDatabaseProfile = readOptionalArgument('--database-profile');
let lastDatabaseSelectionUpdate;
let lastWorkspaceDatabaseProfile;
const logsPath = readOptionalArgument('--logs');
const sqlMonitorHistoryPath = readOptionalArgument('--sql-monitor-history');
const databaseSelectionPath = readOptionalArgument('--database-selection');
const navigationInfoPath = readOptionalArgument('--navigation-info') ?? (0, navigationInfo_1.getNavigationInfoPath)(workspacePath);
const server = new McpServer({ name: 'vc-ve-tools-database', version: '0.17.0' }, {
    instructions: [
        'East Express method names are stored separately in method cards and must never be included in method source code. Method source contains the body only: do not add procedure/function declarations containing the method name.',
        'Use focused read-only tools before query_readonly. Resolve unknown calls with method resolution and object search tools, then follow returned stable IDs.',
        'Before database work, use get_active_database when the intended database matters. Use list_databases and switch_database to select another rdboadm.ini profile without restarting this MCP server.',
        'Use get_class_dictionary for paged dictionary rows and search_class_dictionary to find elements by ID, name, or any mapped class attribute.',
        'Use get_class_properties to inspect script properties declared by a class and optionally inherited from ancestors. Use get_property_details for the complete stored record.',
        'Before update_method_source, read the complete current method body with get_method_source. Send only the method body, never its name or declaration wrapper.',
        'Use get_package_sync_changes to inspect the same changed-object list shown by package synchronization; it returns metadata and paths, never file contents.',
        'Use get_recent_sql_queries to inspect the last 100 filtered queries captured by the SQL monitor without generating additional database traffic.',
        'For VS Code navigation, use open_method for the source editor and reveal_method_in_class to select a method on the owning class Methods tab. Never use cursor or screen automation for these actions.',
        'Direct SQL access is read-only. Controlled mutations are available only through update_method_source and the explicitly confirmed update_database command in VS Code. Database updates run in a visible terminal. Include relevant object IDs in analysis so navigation can continue.',
    ].join(' '),
});
server.registerTool('list_databases', {
    description: 'List database profiles from trunk/bin/rdboadm.ini, including section IDs, display names, safe connection details, and which profile is active in this MCP process.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
}, async () => databaseToolResult(async () => {
    await synchronizeDatabaseSelection();
    const { path, databases } = await (0, rdboadmIni_1.loadRdboadmDatabases)(workspacePath);
    return {
        path,
        activeProfile: activeDatabaseProfile ?? databases[0]?.id ?? null,
        databases: databases.map(database => databaseSummary(database)),
    };
}));
server.registerTool('get_active_database', {
    description: 'Return the database profile and actual PostgreSQL connection currently used by this MCP process.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
}, async () => databaseToolResult(async () => {
    await synchronizeDatabaseSelection();
    const { databases } = await (0, rdboadmIni_1.loadRdboadmDatabases)(workspacePath);
    const database = findDatabaseProfile(databases, activeDatabaseProfile);
    return { active: databaseSummary(database) };
}));
server.registerTool('switch_database', {
    description: 'Switch this MCP process to another rdboadm.ini database profile. The connection is tested before the switch; all subsequent database tools use the selected profile.',
    inputSchema: { profile: z.string().min(1).describe('Section ID from list_databases, for example oetest') },
    annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ profile }) => databaseToolResult(async () => {
    await synchronizeDatabaseSelection();
    const { databases } = await (0, rdboadmIni_1.loadRdboadmDatabases)(workspacePath);
    const database = findDatabaseProfile(databases, profile);
    const options = (0, rdboadmIni_1.rdboadmDatabaseOptions)(database);
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools-mcp-switch-test', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await client.query('SELECT current_database() AS database, inet_server_addr()::text AS server, inet_server_port() AS port, current_user AS user');
        activeDatabaseProfile = database.id;
        return { active: databaseSummary(database), connection: result.rows[0] };
    }
    finally {
        await client.end().catch(() => undefined);
    }
}));
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
server.registerTool('get_class_dictionary', {
    description: 'Read one page of objects from an East Express class dictionary. Returns logical attribute metadata, total count and stable pagination fields.',
    inputSchema: {
        classId: z.number().int().positive().describe('Non-virtual class ID returned by search_classes'),
        offset: z.number().int().min(0).optional().describe('Zero-based row offset, default 0'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, default and maximum 100'),
    },
    annotations: { readOnlyHint: true },
}, async ({ classId, offset, limit }) => databaseToolResult(async () => {
    const storage = await loadClassDictionaryStorage(classId);
    const pageOffset = offset ?? 0;
    const pageLimit = limit ?? 100;
    const values = storage.classIdColumn ? [classId] : [];
    const where = storage.classIdColumn ? ` WHERE ${(0, classAttributes_1.quotePostgresIdentifier)(storage.classIdColumn)} = $1` : '';
    const countRows = await queryDatabaseRaw(`SELECT COUNT(*)::text AS count FROM ${storage.source}${where}`, values);
    const rows = await queryDatabaseRaw(`SELECT * FROM ${storage.source}${where} ORDER BY ${(0, classAttributes_1.quotePostgresIdentifier)(storage.idColumn ?? storage.physicalColumns[0])}
		 LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageLimit, pageOffset]);
    const totalCount = Number(countRows[0]?.count ?? rows.length);
    return dictionaryResult(storage, rows, pageOffset, pageLimit, totalCount);
}));
server.registerTool('search_class_dictionary', {
    description: 'Find dictionary elements inside one East Express class by ID, name or any stored class attribute. Optionally restrict the search to one logical attribute name, attribute ID or database field.',
    inputSchema: {
        classId: z.number().int().positive().describe('Non-virtual class ID returned by search_classes'),
        query: z.string().min(1).describe('Element ID, name or attribute value to find'),
        attribute: z.string().min(1).optional().describe('Optional logical attribute name, attribute ID or physical database field'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum matches, default and maximum 100'),
    },
    annotations: { readOnlyHint: true },
}, async ({ classId, query, attribute, limit }) => databaseToolResult(async () => {
    const storage = await loadClassDictionaryStorage(classId);
    const term = query.trim();
    const normalizedAttribute = attribute?.trim().toLocaleLowerCase('ru');
    const searchable = normalizedAttribute
        ? storage.columns.filter(column => [column.attributeId, column.attributeName, column.key].some(value => value.toLocaleLowerCase('ru') === normalizedAttribute))
        : storage.columns;
    if (searchable.length === 0) {
        throw new Error(`Attribute ${attribute} was not found in class ${storage.className}.`);
    }
    const predicates = [];
    const values = [];
    if (storage.classIdColumn) {
        values.push(classId);
        predicates.push(`${(0, classAttributes_1.quotePostgresIdentifier)(storage.classIdColumn)} = $${values.length}`);
    }
    values.push(`%${term}%`);
    const patternParameter = `$${values.length}`;
    const valuePredicates = searchable.map(column => `${(0, classAttributes_1.quotePostgresIdentifier)(column.key)}::text ILIKE ${patternParameter}`);
    if (/^\d+$/.test(term) && storage.idColumn && searchable.some(column => column.key.toLowerCase() === storage.idColumn?.toLowerCase())) {
        values.push(term);
        valuePredicates.unshift(`${(0, classAttributes_1.quotePostgresIdentifier)(storage.idColumn)}::text = $${values.length}`);
    }
    predicates.push(`(${valuePredicates.join(' OR ')})`);
    const maximum = limit ?? 100;
    values.push(maximum);
    const rows = await queryDatabaseRaw(`SELECT * FROM ${storage.source} WHERE ${predicates.join(' AND ')}
		 ORDER BY ${(0, classAttributes_1.quotePostgresIdentifier)(storage.idColumn ?? storage.physicalColumns[0])} LIMIT $${values.length}`, values);
    return { ...dictionaryResult(storage, rows, 0, maximum, rows.length), query: term, attribute: attribute ?? null, matchCount: rows.length };
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
server.registerTool('get_class_properties', {
    description: 'Read script properties declared by an East Express class, optionally including inherited definitions. Returns owner, aliases, read-only state, visibility, package and stable property IDs.',
    inputSchema: {
        classId: z.number().int().positive().describe('Class ID returned by search_classes'),
        includeInherited: z.boolean().optional().describe('Include properties from ancestor classes, default true'),
        includeShadowed: z.boolean().optional().describe('Include overridden ancestor definitions, default false'),
        query: z.string().optional().describe('Optional case-insensitive filter by property name, alias, ID, owner, visibility or package'),
        limit: z.number().int().min(1).max(500).optional().describe('Maximum properties to return, default 200'),
    },
    annotations: { readOnlyHint: true },
}, async ({ classId, includeInherited, includeShadowed, query, limit }) => databaseToolResult(async () => {
    const classRows = await queryDatabaseRaw('SELECT id, name FROM classes WHERE id = $1', [classId]);
    const selectedClass = classRows[0];
    if (!selectedClass) {
        throw new Error(`Class ${classId} was not found.`);
    }
    let properties = (await loadClassPropertyRows(classId, includeInherited !== false)).map(toMcpClassProperty);
    properties = (0, classProperties_1.selectVisibleProperties)(properties, includeShadowed === true);
    const normalizedQuery = query?.trim().toLocaleLowerCase('ru');
    if (normalizedQuery) {
        properties = properties.filter(property => [property.id, property.name, property.aliases, property.ownerClassName, property.visibility, property.package]
            .some(value => value.toLocaleLowerCase('ru').includes(normalizedQuery)));
    }
    properties.sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.depth - right.depth);
    const maximum = limit ?? 200;
    return {
        classId: String(selectedClass.id), className: selectedClass.name,
        includeInherited: includeInherited !== false, includeShadowed: includeShadowed === true,
        source: 'Properties', binaryPropertiesIncluded: false,
        totalCount: properties.length, count: Math.min(properties.length, maximum), truncated: properties.length > maximum,
        properties: properties.slice(0, maximum),
    };
}));
server.registerTool('get_property_details', {
    description: 'Read the complete stored Properties record for one East Express script property. Binary RTTI-only properties are not stored in this table.',
    inputSchema: { propertyId: z.number().int().positive().describe('Property ID returned by get_class_properties') },
    annotations: { readOnlyHint: true },
}, async ({ propertyId }) => databaseToolResult(async () => {
    const rows = await queryDatabaseRaw(`SELECT to_jsonb(property) AS data, owner.id AS ownerclassid, owner.name AS ownerclassname,
		        visibility.name AS propvisibility, package.packagename AS proppackage
		 FROM properties AS property
		 LEFT JOIN abstract AS owner ON owner.id = property.seniorid
		 LEFT JOIN enum AS visibility ON visibility.classid = 12450282
		   AND ((visibility.id = 12450286 AND (NULLIF(property.visibility, 0) IS NULL OR property.visibility = 12450283))
		     OR (property.visibility <> 12450283 AND visibility.id = property.visibility))
		 LEFT JOIN abstract AS abstract_property ON abstract_property.id = property.id
		 LEFT JOIN sysfile AS file ON file.id = abstract_property.sysfile
		 LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		 LEFT JOIN syspackages AS package ON package.id = file_group.package
		 WHERE property.id = $1`, [propertyId]);
    const row = rows[0];
    if (!row) {
        throw new Error(`Property ${propertyId} was not found.`);
    }
    return {
        found: true,
        property: {
            ...toMcpClassProperty({
                id: propertyId, propname: propertyValue(row.data, 'name'), propaliases: propertyValue(row.data, 'aliases'),
                ownerclassid: row.ownerclassid, ownerclassname: row.ownerclassname,
                proponlyread: isEmptyWriteMember(propertyValue(row.data, 'writemember')) ? 'Да' : null,
                propvisibility: row.propvisibility, proppackage: row.proppackage, depth: 0,
            }),
            data: normalizeAttributeRecord(row.data),
        },
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
server.registerTool('update_method_source', {
    description: 'Replace the complete source body of an existing East Express method through the VS Code extension save pipeline. This mutates the database, preserves Windows-1251, uses the configured vcVeTools.userId, writes audit history, and commits atomically. Read the complete current source first.',
    inputSchema: {
        methodId: z.number().int().positive().describe('Existing method ID returned by search_methods'),
        code: z.string().max(1_500_000).describe('Complete replacement method body without a procedure/function declaration containing the method name'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async ({ methodId, code }) => bridgeToolResult({ action: 'update_method_source', id: methodId, code }));
server.registerTool('update_database', {
    description: 'Update the main or test East Express database using the command from DBUpdate_main.bat or DBUpdate_test.bat in the open workspace. VS Code asks the user for confirmation, then runs the command in a visible terminal.',
    inputSchema: {
        role: z.enum(['main', 'test']).describe('Database role to update'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
}, async ({ role }) => bridgeToolResult({ action: 'update_database', role }));
server.registerTool('start_client', {
    description: 'Launch the original East Express client for the main or test database using start.bat or start_test.bat and the client credentials saved in VS Code settings.',
    inputSchema: {
        role: z.enum(['main', 'test']).describe('Database role whose client should be launched'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async ({ role }) => bridgeToolResult({ action: 'start_client', role }));
server.registerTool('open_client_entity', {
    description: 'Open an East Express entity in the original client by stable ID. If the client is not running, it is launched with the credentials saved in VS Code settings. Use entityType names accepted by client deep links, for example Метод or Класс.',
    inputSchema: {
        id: z.number().int().positive().describe('Stable East Express object ID'),
        entityType: z.string().min(1).max(100).describe('Entity type for the client link, for example Метод, Класс, or another East Express class name'),
        role: z.enum(['main', 'test']).optional().describe('Database role, default main'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async ({ id, entityType, role }) => bridgeToolResult({ action: 'open_client_entity', id, entityType, role: role ?? 'main' }));
server.registerTool('get_svn_file_history', {
    description: 'Read SVN history for a file inside the currently open East Express workspace using the extension SVN integration.',
    inputSchema: {
        filePath: z.string().min(1).describe('Workspace-relative path or absolute path inside the open workspace'),
        limit: z.number().int().min(1).max(500).optional().describe('Maximum revisions, default 100'),
    },
    annotations: { readOnlyHint: true },
}, async ({ filePath, limit }) => bridgeToolResult({ action: 'get_svn_file_history', filePath, limit: limit ?? 100 }));
server.registerTool('get_package_sync_changes', {
    description: 'Return the changed-file/object list shown by East Express package synchronization. Includes IDs, state, revision, MD5, user, date and resolved paths, but never file contents.',
    inputSchema: {
        query: z.string().optional().describe('Optional filter by object ID, name, state, package or path'),
        offset: z.number().int().min(0).optional().describe('Zero-based result offset, default 0'),
        limit: z.number().int().min(1).max(500).optional().describe('Maximum entries, default 100'),
    },
    annotations: { readOnlyHint: true },
}, async ({ query, offset, limit }) => bridgeToolResult({
    action: 'get_package_sync_changes', query, offset: offset ?? 0, limit: limit ?? 100,
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
        const options = await loadActiveDatabaseOptions();
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
                content: [{ type: 'text', text: JSON.stringify({ profile: activeDatabaseProfile, database: options.database, rowCount: rows.length, truncated, rows }, null, 2) }],
                structuredContent: { profile: activeDatabaseProfile, database: options.database, rowCount: rows.length, truncated, rows },
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
server.registerTool('get_recent_sql_queries', {
    description: 'Read the last filtered SQL queries captured from the East Express client and vc-ve-tools. Use this to diagnose what the client did without executing another database query.',
    inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Maximum queries to return, default 30'),
        search: z.string().optional().describe('Optional case-insensitive filter over SQL text, source, user, and first table'),
        operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER']).optional(),
        category: z.enum(['application', 'metadata', 'system', 'transaction']).optional()
            .describe('Optional query category: application, metadata, system, or transaction'),
    },
    annotations: { readOnlyHint: true },
}, async ({ limit, search, operation, category }) => {
    if (!sqlMonitorHistoryPath) {
        return { content: [{ type: 'text', text: 'SQL monitor history path is not configured.' }], isError: true };
    }
    try {
        const records = JSON.parse(await (0, promises_1.readFile)(sqlMonitorHistoryPath, 'utf8'));
        const needle = search?.trim().toLocaleLowerCase('ru');
        const filtered = records
            .filter(record => !operation || record.operation === operation)
            .filter(record => !category || (0, queryCategory_1.classifySqlQuery)({
            text: String(record.text ?? ''),
            firstTable: typeof record.firstTable === 'string' ? record.firstTable : undefined,
        }) === category)
            .filter(record => !needle || [record.text, record.source, record.userName, record.firstTable]
            .some(value => String(value ?? '').toLocaleLowerCase('ru').includes(needle)))
            .slice(-(limit ?? 30))
            .reverse();
        const result = { count: filtered.length, totalStored: records.length, queries: filtered };
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            const result = { count: 0, totalStored: 0, queries: [] };
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        }
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
    const options = await loadActiveDatabaseOptions();
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
async function loadClassPropertyRows(classId, includeInherited) {
    return queryDatabaseRaw(`WITH RECURSIVE class_chain AS (
		 SELECT class.id, class.name, class.seniorid, 0 AS depth, ARRAY[class.id] AS path
		 FROM classes AS class WHERE class.id = $1
		 UNION ALL
		 SELECT parent.id, parent.name, parent.seniorid, chain.depth + 1, chain.path || parent.id
		 FROM classes AS parent JOIN class_chain AS chain ON parent.id = chain.seniorid
		 WHERE NOT parent.id = ANY(chain.path)
		)
		SELECT property.id, property.name AS propname, property.aliases AS propaliases,
		       chain.id AS ownerclassid, chain.name AS ownerclassname,
		       CASE WHEN NULLIF(property.writemember, 0) IS NULL THEN 'Да' END AS proponlyread,
		       visibility.name AS propvisibility, package.packagename AS proppackage, chain.depth
		FROM class_chain AS chain
		JOIN properties AS property ON property.seniorid = chain.id
		LEFT JOIN enum AS visibility ON visibility.classid = 12450282
		 AND ((visibility.id = 12450286 AND (NULLIF(property.visibility, 0) IS NULL OR property.visibility = 12450283))
		   OR (property.visibility <> 12450283 AND visibility.id = property.visibility))
		LEFT JOIN abstract AS abstract_property ON abstract_property.id = property.id
		LEFT JOIN sysfile AS file ON file.id = abstract_property.sysfile
		LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
		LEFT JOIN syspackages AS package ON package.id = file_group.package
		WHERE ($2::boolean OR chain.depth = 0)
		ORDER BY chain.depth, lower(property.name), property.id`, [classId, includeInherited]);
}
function toMcpClassProperty(row) {
    return {
        id: String(row.id), name: propertyText(row.propname), aliases: propertyText(row.propaliases),
        ownerClassId: String(row.ownerclassid), ownerClassName: row.ownerclassname ?? '',
        depth: row.depth, inherited: row.depth > 0, type: '', readOnly: row.proponlyread === 'Да',
        visibility: row.propvisibility ?? '', package: row.proppackage ?? '', isBinary: false,
    };
}
function propertyValue(data, name) {
    const entry = Object.entries(data).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase());
    return entry?.[1];
}
function isEmptyWriteMember(value) {
    return value === null || value === undefined || value === 0 || value === '0' || value === '';
}
function propertyText(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (Buffer.isBuffer(value) || (typeof value === 'string' && /^\\x[\da-f]+$/i.test(value))) {
        return (0, sourceContent_1.decodeSourceValue)(value);
    }
    return String(value);
}
async function loadClassDictionaryStorage(classId) {
    const classRows = await queryDatabaseRaw('SELECT id, name, dbtablename, virtual FROM classes WHERE id = $1', [classId]);
    const selectedClass = classRows[0];
    if (!selectedClass) {
        throw new Error(`Class ${classId} was not found.`);
    }
    if (selectedClass.virtual) {
        throw new Error(`Class ${selectedClass.name} is virtual and has no dictionary storage.`);
    }
    if (!selectedClass.dbtablename?.trim()) {
        throw new Error(`Class ${selectedClass.name} has no database table.`);
    }
    const physicalRows = await queryDatabaseRaw(`SELECT table_schema, table_name, column_name FROM information_schema.columns
		 WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND lower(table_name) = lower($1)
		 ORDER BY CASE WHEN table_schema = current_schema() THEN 0 ELSE 1 END, ordinal_position`, [selectedClass.dbtablename]);
    if (physicalRows.length === 0) {
        throw new Error(`Table ${selectedClass.dbtablename} was not found.`);
    }
    const schema = physicalRows[0].table_schema;
    const table = physicalRows[0].table_name;
    const physicalColumns = physicalRows.filter(row => row.table_schema === schema && row.table_name === table).map(row => row.column_name);
    const physicalByName = new Map(physicalColumns.map(column => [column.toLowerCase(), column]));
    const attributeRows = await queryDatabaseRaw(`WITH RECURSIVE class_chain AS (
		 SELECT id, seniorid, 0 AS depth, ARRAY[id] AS path FROM classes WHERE id = $1
		 UNION ALL SELECT parent.id, parent.seniorid, chain.depth + 1, chain.path || parent.id
		 FROM classes parent JOIN class_chain chain ON chain.seniorid = parent.id WHERE NOT parent.id = ANY(chain.path)
		)
		SELECT attribute.id, attribute.name, attribute.title, attribute.dbfieldname
		FROM class_chain chain JOIN attributes attribute ON attribute.seniorid = chain.id
		WHERE COALESCE(attribute.dbfieldname, '') <> '' AND COALESCE(attribute.static, 0) = 0
		ORDER BY chain.depth, attribute.ord NULLS LAST, attribute.id`, [classId]);
    const used = new Set();
    const columns = [];
    for (const attributeRow of attributeRows) {
        const key = physicalByName.get(attributeRow.dbfieldname.toLowerCase());
        if (!key || used.has(key.toLowerCase())) {
            continue;
        }
        used.add(key.toLowerCase());
        columns.push({ attributeId: String(attributeRow.id), attributeName: attributeRow.name, title: attributeRow.title?.trim() || attributeRow.name, key });
    }
    const idColumn = physicalByName.get('id');
    if (idColumn && !used.has(idColumn.toLowerCase())) {
        columns.unshift({ attributeId: '', attributeName: '_Ид', title: '_Ид', key: idColumn });
    }
    if (columns.length === 0) {
        throw new Error(`Class ${selectedClass.name} has no mapped stored attributes.`);
    }
    return {
        classId,
        className: selectedClass.name,
        source: `${(0, classAttributes_1.quotePostgresIdentifier)(schema)}.${(0, classAttributes_1.quotePostgresIdentifier)(table)}`,
        physicalColumns,
        idColumn,
        classIdColumn: physicalByName.get('classid'),
        columns,
    };
}
function dictionaryResult(storage, rows, offset, limit, totalCount) {
    const normalizedRows = rows.map(row => {
        const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), normalizeValue(value)]));
        return Object.fromEntries(storage.columns.map(column => [column.key, values.get(column.key.toLowerCase()) ?? null]));
    });
    return {
        classId: String(storage.classId), className: storage.className, columns: storage.columns,
        offset, limit, count: normalizedRows.length, totalCount,
        hasMore: offset + normalizedRows.length < totalCount, rows: normalizedRows,
    };
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
async function loadActiveDatabaseOptions() {
    await synchronizeDatabaseSelection();
    try {
        const { databases } = await (0, rdboadmIni_1.loadRdboadmDatabases)(workspacePath);
        const database = findDatabaseProfile(databases, activeDatabaseProfile);
        activeDatabaseProfile = database.id;
        return (0, rdboadmIni_1.rdboadmDatabaseOptions)(database);
    }
    catch (error) {
        if (activeDatabaseProfile) {
            throw error;
        }
        return (0, databaseConfig_1.loadMcpDatabaseOptions)(workspacePath, databaseRole);
    }
}
async function synchronizeDatabaseSelection() {
    if (databaseSelectionPath) {
        try {
            const selection = await (0, databaseSelection_1.readDatabaseSelection)(databaseSelectionPath);
            if (selection.updatedAt !== lastDatabaseSelectionUpdate) {
                lastDatabaseSelectionUpdate = selection.updatedAt;
                if (selection.profile) {
                    activeDatabaseProfile = selection.profile;
                }
            }
            return;
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    // Older copied MCP configurations do not contain --database-selection.
    // Read the workspace setting directly so an already configured agent still follows the UI.
    try {
        const settings = await (0, promises_1.readFile)(path.join(workspacePath, '.vscode', 'settings.json'), 'utf8');
        const match = settings.match(/["']vcVeTools\.databaseProfile["']\s*:\s*["']([^"']+)["']/);
        const profile = match?.[1];
        if (profile && profile !== lastWorkspaceDatabaseProfile) {
            lastWorkspaceDatabaseProfile = profile;
            activeDatabaseProfile = profile;
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}
function findDatabaseProfile(databases, profile) {
    const database = databases.find(item => item.id.toLowerCase() === profile?.toLowerCase()) ?? (!profile ? databases[0] : undefined);
    if (!database) {
        throw new Error(`Database profile [${profile ?? ''}] was not found in rdboadm.ini. Use list_databases to get valid profile IDs.`);
    }
    return database;
}
function databaseSummary(database) {
    const options = (0, rdboadmIni_1.rdboadmDatabaseOptions)(database);
    return { profile: database.id, name: database.name, database: options.database, server: options.host, port: options.port, user: options.user };
}
async function navigationToolResult(action, id, classId) {
    return bridgeToolResult({ action, id, classId });
}
async function bridgeToolResult(body) {
    try {
        const connection = JSON.parse(await (0, promises_1.readFile)(navigationInfoPath, 'utf8'));
        if (typeof connection.url !== 'string' || typeof connection.token !== 'string') {
            throw new Error('VS Code navigation bridge information is invalid.');
        }
        const response = await fetch(connection.url, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
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
            ? `VS Code extension bridge is not running for workspace ${workspacePath}. Open this workspace in VS Code with vc-ve-tools enabled.`
            : `VS Code extension bridge failed: ${detail}`;
        return { content: [{ type: 'text', text: message }], isError: true };
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=server.js.map