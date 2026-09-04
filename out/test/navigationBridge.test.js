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
const assert = __importStar(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const navigationBridge_1 = require("../features/ai/navigationBridge");
suite('Navigation bridge', () => {
    test('publishes an authenticated endpoint and invokes the requested action', async () => {
        let openedMethod;
        let revealedMethod;
        let updatedMethod;
        let updatedDatabase;
        let startedClient;
        const infoPath = (0, node_path_1.join)((0, node_os_1.tmpdir)(), 'vc-ve-tools-test', `navigation-${process.pid}.json`);
        const bridge = await (0, navigationBridge_1.startNavigationBridge)({
            revealClass: async () => undefined,
            openClass: async () => undefined,
            openMethod: async (id) => { openedMethod = id; },
            revealMethod: async (classId, methodId) => { revealedMethod = { classId, methodId }; },
            updateMethodSource: async (methodId, code) => {
                updatedMethod = { methodId, code };
                return { methodId, changed: true };
            },
            getSvnFileHistory: async (filePath, limit) => ({ filePath, limit, entries: [{ revision: 42 }] }),
            getPackageSyncChanges: async (query, offset, limit) => ({ query, offset, limit, items: [{ objectId: 7 }] }),
            updateDatabase: async (role) => { updatedDatabase = role; },
            startClient: async (role) => { startedClient = role; },
            openClientEntity: async (role, entityType, id) => `oe-${role}:/open/${entityType}/${id}`,
        }, infoPath);
        try {
            const connection = JSON.parse(await (0, promises_1.readFile)(infoPath, 'utf8'));
            const response = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'open_method', id: 3200110 }),
            });
            assert.equal(response.status, 200);
            assert.equal(openedMethod, 3200110);
            const revealResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'reveal_method', id: 3200110, classId: 8921658 }),
            });
            assert.equal(revealResponse.status, 200);
            assert.deepEqual(revealedMethod, { classId: 8921658, methodId: 3200110 });
            const updateResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'update_method_source', id: 3200110, code: 'begin\r\nend' }),
            });
            assert.equal(updateResponse.status, 200);
            assert.deepEqual(updatedMethod, { methodId: 3200110, code: 'begin\r\nend' });
            const historyResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'get_svn_file_history', filePath: 'packages/example.pas', limit: 25 }),
            });
            assert.equal(historyResponse.status, 200);
            assert.deepEqual((await historyResponse.json()).entries, [{ revision: 42 }]);
            const syncResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'get_package_sync_changes', query: 'method', offset: 10, limit: 50 }),
            });
            assert.equal(syncResponse.status, 200);
            assert.deepEqual((await syncResponse.json()).items, [{ objectId: 7 }]);
            const databaseResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'update_database', role: 'test' }),
            });
            assert.equal(databaseResponse.status, 200);
            assert.equal(updatedDatabase, 'test');
            const clientResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'start_client', role: 'main' }),
            });
            assert.equal(clientResponse.status, 200);
            assert.equal(startedClient, 'main');
        }
        finally {
            bridge.dispose();
        }
    });
});
//# sourceMappingURL=navigationBridge.test.js.map