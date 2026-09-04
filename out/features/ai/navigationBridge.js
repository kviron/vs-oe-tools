"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNavigationBridge = startNavigationBridge;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_http_1 = require("node:http");
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
        else {
            const result = await actions.getSvnFileHistory(input.filePath, input.limit);
            respond(response, 200, { ok: true, action: input.action, ...result });
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
        && action !== 'update_method_source' && action !== 'get_svn_file_history') {
        throw new Error('Unknown navigation action.');
    }
    if (action !== 'get_svn_file_history' && (!Number.isSafeInteger(id) || (id ?? 0) <= 0)) {
        throw new Error('Navigation ID must be a positive integer.');
    }
    const classId = value.classId;
    if (action === 'reveal_method' && (!Number.isSafeInteger(classId) || (classId ?? 0) <= 0)) {
        throw new Error('Navigation classId must be a positive integer for reveal_method.');
    }
    const code = value.code;
    if (action === 'update_method_source' && typeof code !== 'string') {
        throw new Error('Method code must be a string for update_method_source.');
    }
    const filePath = value.filePath;
    const limit = value.limit;
    if (action === 'get_svn_file_history' && (typeof filePath !== 'string' || !filePath.trim())) {
        throw new Error('filePath is required for get_svn_file_history.');
    }
    if (action === 'get_svn_file_history' && (!Number.isSafeInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
        throw new Error('SVN history limit must be an integer from 1 to 500.');
    }
    return { action, id: id, classId, code, filePath, limit };
}
function respond(response, statusCode, body) {
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}
//# sourceMappingURL=navigationBridge.js.map