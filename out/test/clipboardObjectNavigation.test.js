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
});
function object(overrides) {
    return { id: '1', classId: '2', seniorId: null, name: '', metaClassName: '', ownerName: '', ownerId: null, ownerClassName: '', packageName: '', bitmapId: null, kind: 'object', ...overrides };
}
function actions(calls) {
    return {
        findById: async () => undefined,
        revealClass: async (id) => { calls.push(`revealClass:${id}`); },
        openClass: async (id) => { calls.push(`openClass:${id}`); },
        revealMethod: async (classId, methodId) => { calls.push(`revealMethod:${classId}:${methodId}`); },
        openAttribute: async (classId, attributeId) => { calls.push(`openAttribute:${classId}:${attributeId}`); },
        openDictionary: async (classId, objectId) => { calls.push(`openDictionary:${classId}:${objectId}`); },
        openMethod: async (id) => { calls.push(`openMethod:${id}`); },
        openObject: async (id) => { calls.push(`openObject:${id}`); },
    };
}
//# sourceMappingURL=clipboardObjectNavigation.test.js.map