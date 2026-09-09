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
const svnMergeService_1 = require("../features/package-sync/svnMergeService");
suite('SVN merge service', () => {
    test('parses all touched files and both conflict kinds', () => {
        const files = (0, svnMergeService_1.parseSvnMergeOutput)([
            "--- Merging r145401 into '.':",
            'U    Консультант\\Изменен.pkf',
            'A    Консультант\\Добавлен.pkf',
            'C    Консультант\\Текстовый.pkf',
            '   C Консультант\\Каталог',
        ].join('\r\n'), 'C:\\OE\\R306\\packages');
        assert.deepEqual(files, [
            { path: 'Консультант/Изменен.pkf', status: 'modified', conflicted: false, treeConflict: false },
            { path: 'Консультант/Добавлен.pkf', status: 'added', conflicted: false, treeConflict: false },
            { path: 'Консультант/Текстовый.pkf', status: 'conflicted', conflicted: true, treeConflict: false },
            { path: 'Консультант/Каталог', status: 'conflicted', conflicted: true, treeConflict: true },
        ]);
    });
    test('extracts local and incoming artifacts from svn info XML', () => {
        const parsed = (0, svnMergeService_1.parseSvnConflictInfo)('<info><entry><conflict operation="merge" type="text"><prev-base-file>f.r1</prev-base-file><prev-wc-file>f.mine</prev-wc-file><cur-base-file>f.r2</cur-base-file></conflict></entry></info>');
        assert.deepEqual(parsed, { local: 'f.mine', incoming: 'f.r2' });
    });
});
//# sourceMappingURL=svnMergeService.test.js.map