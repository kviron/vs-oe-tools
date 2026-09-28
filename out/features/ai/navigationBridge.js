"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNavigationBridge = startNavigationBridge;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_http_1 = require("node:http");
const navigationHttp_1 = require("./navigationHttp");
async function startNavigationBridge(actions, infoPath) {
    const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
    const server = (0, node_http_1.createServer)((0, navigationHttp_1.createNavigationHandler)(token, actions));
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
    const removeInfoOnExit = () => {
        try {
            const current = JSON.parse((0, node_fs_1.readFileSync)(infoPath, 'utf8'));
            if (current.token === token) {
                (0, node_fs_1.unlinkSync)(infoPath);
            }
        }
        catch { /* The file may already be gone or belong to another extension host. */ }
    };
    process.once('exit', removeInfoOnExit);
    return {
        url,
        token,
        infoPath,
        dispose: () => {
            process.off('exit', removeInfoOnExit);
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
//# sourceMappingURL=navigationBridge.js.map