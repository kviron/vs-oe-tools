"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNavigationBridge = startNavigationBridge;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_http_1 = require("node:http");
const lifecycleMethodExecution_1 = require("../lifecycle/lifecycleMethodExecution");
async function startNavigationBridge(actions, infoPath) {
    const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
    const server = (0, node_http_1.createServer)((request, response) => void handleRequest(request, response, token, actions));
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/navigate`;
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(infoPath), { recursive: true });
    await (0, promises_1.writeFile)(infoPath, JSON.stringify({ url, token }), { encoding: 'utf8', mode: 0o600 });
    return {
        url,
        token,
        infoPath,
        dispose: () => {
            server.close();
            void removeOwnInfoFile(infoPath, token);
        },
    };
}
async function removeOwnInfoFile(infoPath, token) {
    try {
        const current = JSON.parse(await (0, promises_1.readFile)(infoPath, 'utf8'));
        if (current.token === token) {
            await (0, promises_1.unlink)(infoPath);
        }
    }
    catch {
        // The file may already be gone or replaced by a newer extension host.
    }
}
async function handleRequest(request, response, token, actions) {
    try {
        if (request.method !== 'POST' || request.url !== '/navigate') {
            respond(response, 404, { error: 'Not found.' });
            return;
        }
        if (!isAuthorized(request.headers.authorization, token)) {
            respond(response, 401, { error: 'Unauthorized.' });
            return;
        }
        const input = validateRequest(JSON.parse(await readBody(request)));
        if (input.action === 'reveal_class') {
            await actions.revealClass(input.id);
        }
        else if (input.action === 'open_class') {
            await actions.revealClass(input.id);
            await actions.openClass(input.id);
        }
        else if (input.action === 'open_method') {
            await actions.openMethod(input.id);
        }
        else if (input.action === 'reveal_method') {
            await actions.revealMethod(input.classId, input.id);
        }
        else if (input.action === 'update_method_source') {
            const result = await actions.updateMethodSource(input.id, input.code);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'update_module_source') {
            const result = await actions.updateModuleSource(input.id, input.code, input.expectedDatabase, input.expectedHost, input.expectedPort);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'bind_objects_to_package') {
            const result = await actions.bindObjectsToPackage({
                objectIds: input.objectIds, templateObjectId: input.templateObjectId,
                sysFileId: input.sysFileId, expectedDatabase: input.expectedDatabase,
                expectedHost: input.expectedHost, expectedPort: input.expectedPort,
            });
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'create_class_attribute') {
            const result = await actions.createClassAttribute(input.draft);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'execute_lifecycle_method') {
            const result = await actions.executeLifecycleMethod(input.id, input.methodParameter, input.database, input.host);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'start_client_mcp') {
            const result = await actions.startClientMcp(input.database, input.host);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'start_http_test_server') {
            respond(response, 200, { ok: true, action: input.action, ...await actions.startHttpTestServer(input.methodParameter) });
            return;
        }
        else if (input.action === 'stop_http_test_server') {
            respond(response, 200, { ok: true, action: input.action, ...await actions.stopHttpTestServer() });
            return;
        }
        else if (input.action === 'get_http_test_server_status') {
            respond(response, 200, { ok: true, action: input.action, ...await actions.getHttpTestServerStatus() });
            return;
        }
        else if (input.action === 'call_http_test_server') {
            respond(response, 200, { ok: true, action: input.action, ...await actions.callHttpTestServer({
                    method: input.httpMethod, methodName: input.methodParameter,
                    headers: input.headers, body: input.body,
                }) });
            return;
        }
        else if (input.action === 'get_svn_file_history') {
            const result = await actions.getSvnFileHistory(input.filePath, input.limit);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'get_package_sync_changes') {
            const result = await actions.getPackageSyncChanges(input.query, input.offset, input.limit);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'get_production_tasks') {
            const result = await actions.getProductionTasks(input.query, input.limit);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'get_production_task') {
            const result = await actions.getProductionTask(input.query, input.limit);
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'get_production_tasks_in_progress') {
            const result = await actions.getProductionTasksInProgress();
            respond(response, 200, { ok: true, action: input.action, ...result });
            return;
        }
        else if (input.action === 'update_packages') {
            const launched = await actions.updatePackages();
            respond(response, 200, { ok: true, action: input.action, launched });
            return;
        }
        else if (input.action === 'update_binaries') {
            const launched = await actions.updateBinaries();
            respond(response, 200, { ok: true, action: input.action, launched });
            return;
        }
        else if (input.action === 'update_database') {
            await actions.updateDatabase(input.role);
            respond(response, 200, { ok: true, action: input.action, role: input.role });
            return;
        }
        else if (input.action === 'start_client') {
            await actions.startClient(input.role);
            respond(response, 200, { ok: true, action: input.action, role: input.role });
            return;
        }
        else {
            const uri = await actions.openClientEntity(input.role, input.entityType, input.id);
            respond(response, 200, { ok: true, action: input.action, role: input.role, entityType: input.entityType, id: input.id, uri });
            return;
        }
        respond(response, 200, { ok: true, action: input.action, id: input.id });
    }
    catch (error) {
        respond(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
}
function isAuthorized(header, token) {
    const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const expectedBytes = Buffer.from(token);
    const suppliedBytes = Buffer.from(supplied);
    return expectedBytes.length === suppliedBytes.length && (0, node_crypto_1.timingSafeEqual)(expectedBytes, suppliedBytes);
}
async function readBody(request) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.length;
        if (length > 6 * 1024 * 1024) {
            throw new Error('Bridge request is too large.');
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}
function validateRequest(value) {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid navigation request.');
    }
    const { action, id } = value;
    if (action !== 'reveal_class' && action !== 'open_class' && action !== 'open_method' && action !== 'reveal_method'
        && action !== 'update_method_source' && action !== 'update_module_source' && action !== 'get_svn_file_history' && action !== 'get_package_sync_changes'
        && action !== 'bind_objects_to_package'
        && action !== 'update_database' && action !== 'start_client' && action !== 'open_client_entity'
        && action !== 'get_production_tasks' && action !== 'get_production_task' && action !== 'get_production_tasks_in_progress'
        && action !== 'update_packages' && action !== 'update_binaries' && action !== 'create_class_attribute'
        && action !== 'execute_lifecycle_method' && action !== 'start_client_mcp'
        && action !== 'start_http_test_server' && action !== 'stop_http_test_server'
        && action !== 'get_http_test_server_status' && action !== 'call_http_test_server') {
        throw new Error('Unknown navigation action.');
    }
    if (action !== 'get_svn_file_history' && action !== 'get_package_sync_changes' && action !== 'update_database'
        && action !== 'start_client' && action !== 'get_production_tasks' && action !== 'get_production_task' && action !== 'get_production_tasks_in_progress'
        && action !== 'update_packages' && action !== 'update_binaries'
        && action !== 'create_class_attribute' && action !== 'start_client_mcp'
        && action !== 'bind_objects_to_package'
        && action !== 'start_http_test_server' && action !== 'stop_http_test_server'
        && action !== 'get_http_test_server_status' && action !== 'call_http_test_server'
        && (!Number.isSafeInteger(id) || (id ?? 0) <= 0)) {
        throw new Error('Navigation ID must be a positive integer.');
    }
    const classId = value.classId;
    if (action === 'reveal_method' && (!Number.isSafeInteger(classId) || (classId ?? 0) <= 0)) {
        throw new Error('Navigation classId must be a positive integer for reveal_method.');
    }
    const code = value.code;
    const expectedDatabase = value.expectedDatabase;
    const expectedHost = value.expectedHost;
    const expectedPort = value.expectedPort;
    if ((action === 'update_method_source' || action === 'update_module_source') && typeof code !== 'string') {
        throw new Error(`Code must be a string for ${action}.`);
    }
    if (action === 'update_module_source' && (typeof expectedDatabase !== 'string' || !expectedDatabase.trim()
        || typeof expectedHost !== 'string' || !expectedHost.trim()
        || !Number.isInteger(expectedPort) || (expectedPort ?? 0) < 1 || (expectedPort ?? 0) > 65535)) {
        throw new Error('expectedDatabase, expectedHost and expectedPort are required for update_module_source.');
    }
    const objectIds = value.objectIds;
    const templateObjectId = value.templateObjectId;
    const sysFileId = value.sysFileId;
    if (action === 'bind_objects_to_package') {
        if (!Array.isArray(objectIds) || objectIds.length < 1 || objectIds.length > 100
            || objectIds.some(objectId => !Number.isSafeInteger(objectId) || objectId <= 0)) {
            throw new Error('objectIds must contain 1 to 100 positive integers for bind_objects_to_package.');
        }
        if ((templateObjectId === undefined) === (sysFileId === undefined)) {
            throw new Error('Exactly one of templateObjectId or sysFileId is required for bind_objects_to_package.');
        }
        if (typeof expectedDatabase !== 'string' || !expectedDatabase.trim()) {
            throw new Error('expectedDatabase is required for bind_objects_to_package.');
        }
        if (typeof expectedHost !== 'string' || !expectedHost.trim()
            || !Number.isInteger(expectedPort) || (expectedPort ?? 0) < 1 || (expectedPort ?? 0) > 65535) {
            throw new Error('expectedHost and expectedPort are required for bind_objects_to_package.');
        }
    }
    const draft = value.draft;
    if (action === 'create_class_attribute' && (!draft || typeof draft !== 'object')) {
        throw new Error('draft is required for create_class_attribute.');
    }
    const methodParameter = value.methodParameter;
    const database = value.database;
    const host = value.host;
    if (action === 'execute_lifecycle_method' && (typeof methodParameter !== 'string' || !methodParameter.trim())) {
        throw new Error('methodParameter is required for execute_lifecycle_method.');
    }
    if (action === 'execute_lifecycle_method' && id !== lifecycleMethodExecution_1.createLifecycleParameterMethodId) {
        throw new Error(`Method ${id} is not allowlisted for execute_lifecycle_method.`);
    }
    if (action === 'execute_lifecycle_method' && (typeof database !== 'string' || !/^[\p{L}\p{N}_.-]+$/u.test(database))) {
        throw new Error('database is invalid for execute_lifecycle_method.');
    }
    if (action === 'execute_lifecycle_method' && (typeof host !== 'string' || !/^[\p{L}\p{N}_.:-]+$/u.test(host))) {
        throw new Error('host is invalid for execute_lifecycle_method.');
    }
    if (action === 'start_client_mcp' && (typeof database !== 'string' || !/^[\p{L}\p{N}_.-]+$/u.test(database))) {
        throw new Error('database is invalid for start_client_mcp.');
    }
    if (action === 'start_client_mcp' && (typeof host !== 'string' || !/^[\p{L}\p{N}_.:-]+$/u.test(host))) {
        throw new Error('host is invalid for start_client_mcp.');
    }
    if (action === 'start_http_test_server' && (typeof methodParameter !== 'string' || !methodParameter.trim())) {
        throw new Error('An exact methodName is required for start_http_test_server.');
    }
    const httpMethod = value.httpMethod;
    if (action === 'call_http_test_server' && (typeof httpMethod !== 'string' || !httpMethod.trim())) {
        throw new Error('httpMethod is required for call_http_test_server.');
    }
    const headers = value.headers;
    const body = value.body;
    if (action === 'call_http_test_server') {
        if (headers !== undefined && (!headers || typeof headers !== 'object' || Array.isArray(headers)
            || Object.values(headers).some(header => typeof header !== 'string'))) {
            throw new Error('HTTP headers must be an object with string values.');
        }
        if (body !== undefined && typeof body !== 'string') {
            throw new Error('HTTP body must be a string.');
        }
    }
    const filePath = value.filePath;
    const limit = value.limit;
    if (action === 'get_svn_file_history' && (typeof filePath !== 'string' || !filePath.trim())) {
        throw new Error('filePath is required for get_svn_file_history.');
    }
    if (action === 'get_svn_file_history' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
        throw new Error('SVN history limit must be an integer from 1 to 500.');
    }
    const query = value.query;
    const offset = value.offset;
    if (action === 'get_package_sync_changes' && query !== undefined && typeof query !== 'string') {
        throw new Error('Package synchronization query must be a string.');
    }
    if (action === 'get_package_sync_changes' && (!Number.isSafeInteger(offset) || (offset ?? -1) < 0)) {
        throw new Error('Package synchronization offset must be a non-negative integer.');
    }
    if (action === 'get_package_sync_changes' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
        throw new Error('Package synchronization limit must be an integer from 1 to 500.');
    }
    if (action === 'get_production_tasks' && query !== undefined && typeof query !== 'string') {
        throw new Error('Production tasks query must be a string.');
    }
    if (action === 'get_production_tasks' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 250)) {
        throw new Error('Production tasks limit must be an integer from 1 to 250.');
    }
    if (action === 'get_production_task' && (typeof query !== 'string' || !query.trim())) {
        throw new Error('Production task query must be a non-empty string.');
    }
    if (action === 'get_production_task' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 25)) {
        throw new Error('Production task search limit must be an integer from 1 to 25.');
    }
    const role = value.role;
    if ((action === 'update_database' || action === 'start_client' || action === 'open_client_entity') && role !== 'main' && role !== 'test') {
        throw new Error(`Role must be main or test for ${action}.`);
    }
    const entityType = value.entityType;
    if (action === 'open_client_entity' && (typeof entityType !== 'string' || !entityType.trim())) {
        throw new Error('entityType is required for open_client_entity.');
    }
    return { action, id, classId, code, objectIds, templateObjectId, sysFileId, expectedDatabase, expectedHost, expectedPort,
        filePath, limit, query, offset, role, entityType, draft, methodParameter, database, host, httpMethod, headers, body };
}
function respond(response, statusCode, body) {
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}
//# sourceMappingURL=navigationBridge.js.map