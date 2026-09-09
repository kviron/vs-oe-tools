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
const spuCreation_1 = require("../features/spu/spuCreation");
suite('SPU creation helpers', () => {
    test('builds the package filename used by East Express', () => {
        assert.equal((0, spuCreation_1.buildSpuFileName)('  87972 - Тест  '), 'SPU_87972 - Тест');
    });
    test('derives the million-sized automatic range from PackageSTune ID', () => {
        assert.equal((0, spuCreation_1.getAutomaticIdRangeStart)(41651432), 41000001);
        assert.throws(() => (0, spuCreation_1.getAutomaticIdRangeStart)(0), /диапазон ID/);
    });
    test('serializes quotes and SPU fields for the audit record', () => {
        const values = (0, spuCreation_1.serializeSpuAuditValues)(draft({ name: 'SPU "тест"', sqlScript: "select 'x';" }), 17);
        assert.match(values, /103,"SPU ""тест"""/);
        assert.match(values, /4029346,"07\.09\.2026 15:42:42"/);
        assert.match(values, /12609686,17/);
        assert.match(values, /12609690,"select 'x';"/);
    });
    test('requires a name, package and valid execution order', () => {
        assert.throws(() => (0, spuCreation_1.validateSpuDraft)(draft({ name: '' })), /наименование/);
        assert.throws(() => (0, spuCreation_1.validateSpuDraft)(draft({ packageId: 0 })), /пакет/);
        assert.throws(() => (0, spuCreation_1.validateSpuDraft)(draft({ executionOrder: 'bad' })), /порядок выполнения/);
        assert.doesNotThrow(() => (0, spuCreation_1.validateSpuDraft)(draft()));
    });
    test('serializes only changed fields when an SPU is edited', () => {
        const previous = draft({ isAfterUpdate: false, sqlScript: 'select 1;' });
        const next = draft({ isAfterUpdate: true, sqlScript: 'select 2;' });
        assert.deepEqual((0, spuCreation_1.serializeSpuAuditChanges)(previous, next, 0, 0), {
            oldValues: '12609688,,12609690,"select 1;"',
            newValues: '12609688,-1,12609690,"select 2;"',
        });
    });
});
function draft(overrides = {}) {
    return {
        name: 'Тест', packageId: 11306023, typeId: 10200541, executionOrder: '2026-09-07T15:42:42',
        versionControl: false, beginVersion: 0, isAfterUpdate: true, executeAlways: false,
        sqlScript: 'select 1;', comment: '', ...overrides,
    };
}
//# sourceMappingURL=spuCreation.test.js.map