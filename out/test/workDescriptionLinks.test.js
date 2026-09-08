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
const workDescriptionLinks_1 = require("../features/production-tasks/workDescriptionLinks");
suite('Production task work description links', () => {
    test('extracts East Express object IDs and preserves surrounding text', () => {
        assert.deepEqual((0, workDescriptionLinks_1.splitWorkDescriptionObjectIds)('Класс 12857713 и метод 3200110.'), [
            { text: 'Класс ' },
            { text: '12857713', id: 12857713, kind: 'object' },
            { text: ' и метод ' },
            { text: '3200110', id: 3200110, kind: 'object' },
            { text: '.' },
        ]);
    });
    test('recognizes explicit task IDs and web links', () => {
        assert.deepEqual((0, workDescriptionLinks_1.splitWorkDescriptionObjectIds)('Задача ID 934593105: https://example.test/info.'), [
            { text: 'Задача ID ' },
            { text: '934593105', id: 934593105, kind: 'task' },
            { text: ': ' },
            { text: 'https://example.test/info', href: 'https://example.test/info' },
            { text: '.' },
        ]);
    });
    test('does not link task numbers, releases, list numbers, or unsafe integers', () => {
        const value = 'РИЦ 016, релиз 3.6, задача 85008, значение 99999999999999999999.';
        assert.deepEqual((0, workDescriptionLinks_1.splitWorkDescriptionObjectIds)(value), [{ text: value }]);
    });
});
//# sourceMappingURL=workDescriptionLinks.test.js.map