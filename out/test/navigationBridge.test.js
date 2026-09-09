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
        let productionTaskQuery;
        let fullProductionTaskQuery;
        let packagesUpdated = false;
        let binariesUpdated = false;
        let createdAttributeName;
        let createdMethodName;
        let createdMethodTarget;
        let executedLifecycleMethod;
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
            createClassMethod: async (draft, database, host) => {
                createdMethodName = draft.name;
                createdMethodTarget = { database, host };
                return { methodId: 3200151, ownerClassId: draft.ownerClassId, name: draft.name };
            },
            createClassAttribute: async (draft) => {
                createdAttributeName = draft.name;
                return { attributeId: 3200144, ownerClassId: draft.ownerClassId, name: draft.name };
            },
            executeLifecycleMethod: async (methodId, methodParameter, database, host) => {
                executedLifecycleMethod = { methodId, methodParameter, database, host };
                return { methodId, database, output: 'ok' };
            },
            getSvnFileHistory: async (filePath, limit) => ({ filePath, limit, entries: [{ revision: 42 }] }),
            getPackageSyncChanges: async (query, offset, limit) => ({ query, offset, limit, items: [{ objectId: 7 }] }),
            getProductionTasks: async (query, limit) => {
                productionTaskQuery = { query, limit };
                return { count: 1, tasks: [{ id: 902173152, number: '85008' }] };
            },
            getProductionTask: async (query, limit) => {
                fullProductionTaskQuery = { query, limit };
                return { count: 1, match: { id: 934593105, number: '88440', workDescription: 'Полное описание' } };
            },
            getProductionTasksInProgress: async () => ({ count: 1, tasks: [{ id: 902173152, state: 'В работе' }] }),
            updatePackages: async () => { packagesUpdated = true; return true; },
            updateBinaries: async () => { binariesUpdated = true; return false; },
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
            const createMethodResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'create_class_method', database: 'oetest', host: 'localhost', draft: {
                        ownerClassId: 3200139, name: 'acTestExecute', visibilityId: 12450286,
                        methodType: 3, methodKind: 0, signature: '', code: 'proc()\r\nbegin\r\nend;',
                    } }),
            });
            assert.equal(createMethodResponse.status, 200);
            assert.equal(createdMethodName, 'acTestExecute');
            assert.deepEqual(createdMethodTarget, { database: 'oetest', host: 'localhost' });
            assert.equal((await createMethodResponse.json()).methodId, 3200151);
            const attributeResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'create_class_attribute', draft: {
                        ownerClassId: 3200139, name: 'аТест', aliases: 'aTest', dbFieldName: 'aTest', attributeTypeId: 303,
                        valueClasses: '', visibilityId: 12450284, distributionModeId: 12450505,
                        isNotNull: false, virtual: true, refIntegrityCheck: false,
                    } }),
            });
            assert.equal(attributeResponse.status, 200);
            assert.equal(createdAttributeName, 'аТест');
            assert.equal((await attributeResponse.json()).attributeId, 3200144);
            const methodResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'execute_lifecycle_method', id: 3143815,
                    methodParameter: 'paramName=A,paramKind=8927425', database: 'oetest', host: 'localhost' }),
            });
            assert.equal(methodResponse.status, 200);
            assert.deepEqual(executedLifecycleMethod, { methodId: 3143815, methodParameter: 'paramName=A,paramKind=8927425', database: 'oetest', host: 'localhost' });
            assert.equal((await methodResponse.json()).output, 'ok');
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
            const tasksResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'get_production_tasks', query: '85008', limit: 25 }),
            });
            assert.equal(tasksResponse.status, 200);
            assert.deepEqual(productionTaskQuery, { query: '85008', limit: 25 });
            assert.deepEqual((await tasksResponse.json()).tasks, [{ id: 902173152, number: '85008' }]);
            const fullTaskResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'get_production_task', query: 'Связанные объекты', limit: 10 }),
            });
            assert.equal(fullTaskResponse.status, 200);
            assert.deepEqual(fullProductionTaskQuery, { query: 'Связанные объекты', limit: 10 });
            assert.deepEqual((await fullTaskResponse.json()).match, {
                id: 934593105, number: '88440', workDescription: 'Полное описание',
            });
            const inProgressResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'get_production_tasks_in_progress' }),
            });
            assert.equal(inProgressResponse.status, 200);
            assert.deepEqual((await inProgressResponse.json()).tasks, [{ id: 902173152, state: 'В работе' }]);
            const databaseResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'update_database', role: 'test' }),
            });
            assert.equal(databaseResponse.status, 200);
            assert.equal(updatedDatabase, 'test');
            const packagesResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'update_packages' }),
            });
            assert.equal(packagesResponse.status, 200);
            assert.equal((await packagesResponse.json()).launched, true);
            assert.equal(packagesUpdated, true);
            const binariesResponse = await fetch(connection.url, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'update_binaries' }),
            });
            assert.equal(binariesResponse.status, 200);
            assert.equal((await binariesResponse.json()).launched, false);
            assert.equal(binariesUpdated, true);
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