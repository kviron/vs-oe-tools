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
const clipboardObjectRouting_1 = require("../features/explorer/clipboardObjectRouting");
suite('Clipboard object navigation', () => {
    test('parses raw and visually grouped IDs', () => {
        assert.equal((0, clipboardObjectRouting_1.parseClipboardObjectId)('10654528'), 10654528);
        assert.equal((0, clipboardObjectRouting_1.parseClipboardObjectId)('10 654 528\r\n'), 10654528);
        assert.equal((0, clipboardObjectRouting_1.parseClipboardObjectId)('ID=10654528'), undefined);
        assert.equal((0, clipboardObjectRouting_1.parseClipboardObjectId)('0'), undefined);
    });
    test('extracts navigation queries from IDs and task links', () => {
        assert.equal((0, clipboardObjectRouting_1.parseClipboardNavigationQuery)('ID=10 654 528'), '10654528');
        assert.equal((0, clipboardObjectRouting_1.parseClipboardNavigationQuery)('https://r.oe-it.ru/88212'), '88212');
        assert.equal((0, clipboardObjectRouting_1.parseClipboardNavigationQuery)('oe-oetrunk:/open/Метод/3200176'), '3200176');
        assert.equal((0, clipboardObjectRouting_1.parseClipboardNavigationQuery)('ordinary clipboard text'), undefined);
    });
    test('reveals a method in its owning class', async () => {
        const calls = [];
        await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', seniorId: '20', kind: 'method' }), 'explorer', actions(calls));
        assert.deepEqual(calls, ['revealMethod:20:25']);
    });
    test('reveals a class and opens its card', async () => {
        const calls = [];
        await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', kind: 'class' }), 'explorer', actions(calls));
        assert.deepEqual(calls, ['revealClass:25', 'openClass:25']);
    });
    test('opens the object table for a class', async () => {
        const calls = [];
        await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', kind: 'class' }), 'classObjects', actions(calls));
        assert.deepEqual(calls, ['openClassObjects:25']);
    });
    test('rejects the object table target for a non-class object', async () => {
        await assert.rejects((0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', kind: 'method' }), 'classObjects', actions([])), /только для класса/u);
    });
    test('opens a dictionary for a regular object', async () => {
        const calls = [];
        await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', classId: '5', kind: 'object' }), 'explorer', actions(calls));
        assert.deepEqual(calls, ['openDictionary:5:25']);
    });
    test('opens a method editor when the object itself is selected', async () => {
        const calls = [];
        await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', seniorId: '20', kind: 'method' }), 'object', actions(calls));
        assert.deepEqual(calls, ['openMethod:25']);
    });
    test('opens a module editor for every module object', async () => {
        const calls = [];
        await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', seniorId: '20', kind: 'module' }), 'object', actions(calls));
        assert.deepEqual(calls, ['openModule:25']);
    });
    test('opens the universal object view for every database object kind', async () => {
        for (const kind of ['class', 'method', 'attribute', 'object']) {
            const calls = [];
            await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object({ id: '25', kind }), 'objectView', actions(calls));
            assert.deepEqual(calls, ['openObject:25']);
        }
    });
    test('searches a task only when no database object was found', async () => {
        const calls = [];
        const task = productionTask({ id: 900000001, number: '88212' });
        const navigationActions = actions(calls, undefined, task);
        const match = await (0, clipboardObjectRouting_1.findClipboardNavigationMatch)(88212, navigationActions);
        assert.deepEqual(match, { kind: 'task', task });
        assert.deepEqual(calls, ['findObject:88212', 'findTask:88212']);
    });
    test('does not search a task when a database object was found', async () => {
        const calls = [];
        const foundObject = object({ id: '88212' });
        const match = await (0, clipboardObjectRouting_1.findClipboardNavigationMatch)(88212, actions(calls, foundObject));
        assert.deepEqual(match, { kind: 'object', object: foundObject });
        assert.deepEqual(calls, ['findObject:88212']);
    });
    test('finds a package after object and task fallbacks', async () => {
        const calls = [];
        const navigationActions = actions(calls);
        navigationActions.searchPackages = async (query) => { calls.push(`searchPackages:${query}`); return [{ id: 77, name: 'Package' }]; };
        const match = await (0, clipboardObjectRouting_1.findClipboardNavigationMatch)(77, navigationActions);
        assert.deepEqual(match, { kind: 'package', package: { id: 77, name: 'Package' } });
        assert.deepEqual(calls, ['findObject:77', 'findTask:77', 'searchPackages:77']);
    });
    test('still finds a package when task lookup fails', async () => {
        const calls = [];
        const navigationActions = actions(calls);
        navigationActions.findTaskByReference = async (id) => { calls.push(`findTask:${id}`); throw new Error('OENP unavailable'); };
        navigationActions.searchPackages = async (query) => { calls.push(`searchPackages:${query}`); return [{ id: 77, name: 'Package' }]; };
        const match = await (0, clipboardObjectRouting_1.findClipboardNavigationMatch)(77, navigationActions);
        assert.deepEqual(match, { kind: 'package', package: { id: 77, name: 'Package' } });
        assert.deepEqual(calls, ['findObject:77', 'findTask:77', 'searchPackages:77']);
    });
    test('searches local sources independently from tasks', async () => {
        const calls = [];
        const foundObject = object({ id: '88212' });
        const task = productionTask({ id: 900000001, number: '88212' });
        const navigationActions = actions(calls, undefined, undefined, [foundObject], [task]);
        const local = await (0, clipboardObjectRouting_1.searchLocalClipboardNavigation)('88212', navigationActions);
        assert.deepEqual(local.matches, [{ kind: 'object', object: foundObject }]);
        assert.deepEqual(calls, ['searchObjects:88212', 'searchPackages:88212']);
        const remote = await (0, clipboardObjectRouting_1.searchTaskClipboardNavigation)('88212', navigationActions);
        assert.deepEqual(remote.matches, [{ kind: 'task', task }]);
        assert.deepEqual(calls, ['searchObjects:88212', 'searchPackages:88212', 'searchTasks:88212']);
    });
});
function object(overrides) {
    return { id: '1', classId: '2', seniorId: null, name: '', metaClassName: '', ownerName: '', ownerId: null, ownerClassName: '', packageName: '', bitmapId: null, kind: 'object', ...overrides };
}
function productionTask(overrides) {
    return {
        id: 1, number: '', state: '', title: '', createdAt: '', deadline: '', activityKind: '', workType: '', project: '',
        author: '', manager: '', analyst: '', executor: '', responsibleUser: '', responsibleUserId: 0, reviewer: '', appeal: '',
        packageName: '', newsSection: '', priority: '', effort: '', releasePlan: '', releaseActual: '', revisionTrunk: '',
        revisionBranch: '', attachmentCount: 0, workDescription: '', stateComment: '', stateCommentAuthor: '', ...overrides,
    };
}
function actions(calls, foundObject, foundTask, objects = [], tasks = []) {
    return {
        findById: async (id) => { calls.push(`findObject:${id}`); return foundObject; },
        findTaskByReference: async (id) => { calls.push(`findTask:${id}`); return foundTask; },
        searchObjects: async (query) => { calls.push(`searchObjects:${query}`); return objects; },
        searchTasks: async (query) => { calls.push(`searchTasks:${query}`); return tasks; },
        searchPackages: async (query) => { calls.push(`searchPackages:${query}`); return []; },
        revealClass: async (id) => { calls.push(`revealClass:${id}`); },
        openClass: async (id) => { calls.push(`openClass:${id}`); },
        openClassObjects: async (id) => { calls.push(`openClassObjects:${id}`); },
        revealMethod: async (classId, methodId) => { calls.push(`revealMethod:${classId}:${methodId}`); },
        openAttribute: async (classId, attributeId) => { calls.push(`openAttribute:${classId}:${attributeId}`); },
        openDictionary: async (classId, objectId) => { calls.push(`openDictionary:${classId}:${objectId}`); },
        openMethod: async (id) => { calls.push(`openMethod:${id}`); },
        openModule: async (id) => { calls.push(`openModule:${id}`); },
        openObject: async (id) => { calls.push(`openObject:${id}`); },
        openHistory: async (value) => { calls.push(`openHistory:${value.id}`); },
        openTask: async (task) => { calls.push(`openTask:${task.id}`); },
        revealPackage: async (id) => { calls.push(`revealPackage:${id}`); },
    };
}
//# sourceMappingURL=clipboardObjectNavigation.test.js.map