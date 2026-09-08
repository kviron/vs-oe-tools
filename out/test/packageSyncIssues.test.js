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
const packageSyncIssues_1 = require("../features/package-sync/packageSyncIssues");
suite('Package sync issues', () => {
    test('reports a reference placed in #package$', () => {
        const issues = (0, packageSyncIssues_1.findPackagePlaceholderIssues)([
            item({ objectId: 38689557, objectClassId: 10, packagePath: '#package$' }),
        ]);
        assert.equal(issues.length, 1);
        assert.equal(issues[0]?.message, 'ID 38689557 попал в #package$');
    });
    test('recognizes a nested placeholder path and ignores non-reference objects', () => {
        const issues = (0, packageSyncIssues_1.findPackagePlaceholderIssues)([
            item({ objectId: 1, objectClassId: 10, objectPath: 'Refs\\#PACKAGE$\\Item' }),
            item({ objectId: 2, objectClassId: 5, packagePath: '#package$' }),
            item({ objectId: 3, objectClassId: 10, packagePath: 'УправлениеРаботами' }),
        ]);
        assert.deepEqual(issues.map(issue => issue.objectId), [1]);
    });
});
function item(overrides) {
    return {
        objectId: 1, objectClassId: 10, objectSeniorId: null, objectName: 'Ссылка', contentMd5: '', contentRevision: null,
        changeState: '1', changedAt: '', changedBy: 'Пользователь', objectPath: '', packagePath: '', ...overrides,
    };
}
//# sourceMappingURL=packageSyncIssues.test.js.map