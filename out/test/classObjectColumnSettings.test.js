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
const classObjectColumnSettings_1 = require("../features/classes/classObjectColumnSettings");
suite('Class object column settings', () => {
    test('uses a separate workspace key for every dictionary class', () => {
        assert.equal((0, classObjectColumnSettings_1.classObjectColumnSettingsKey)(10), 'vcVeTools.classObjectColumnSettings.10');
        assert.notEqual((0, classObjectColumnSettings_1.classObjectColumnSettingsKey)(10), (0, classObjectColumnSettings_1.classObjectColumnSettingsKey)(11));
    });
    test('restores visibility, order and compact mode', () => {
        assert.deepEqual((0, classObjectColumnSettings_1.normalizeClassObjectColumnSettings)(['id', 'name', 'code'], {
            visible: ['code', 'id'],
            order: ['code', 'name', 'id'],
            compact: false,
        }), {
            visible: ['code', 'id'],
            order: ['code', 'name', 'id'],
            compact: false,
        });
    });
    test('shows newly added fields while discarding removed fields', () => {
        assert.deepEqual((0, classObjectColumnSettings_1.normalizeClassObjectColumnSettings)(['id', 'name', 'newField'], {
            visible: ['id', 'removed'],
            order: ['name', 'id', 'removed'],
            compact: true,
        }), {
            visible: ['id', 'newField'],
            order: ['name', 'id', 'newField'],
            compact: true,
        });
    });
    test('never allows a non-empty dictionary to hide every column', () => {
        assert.deepEqual((0, classObjectColumnSettings_1.normalizeClassObjectColumnSettings)(['id', 'name'], {
            visible: [],
            order: ['id', 'name'],
            compact: true,
        }).visible, ['id']);
    });
});
//# sourceMappingURL=classObjectColumnSettings.test.js.map