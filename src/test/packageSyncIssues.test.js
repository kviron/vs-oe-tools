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
    test('reports the concrete object found inside #package$.pkf', () => {
        const source = `file\r\ndata\r\n  object $"Выполнение действия по ЖЦ": ТипДействияНадОбьектом\r\n    _Ид = '3200004';\r\n    _Сеньор = '20005';\r\n  end;\r\nend.`;
        const objects = (0, packageSyncIssues_1.parsePackagePlaceholderObjects)(source);
        const issues = (0, packageSyncIssues_1.createPackagePlaceholderIssues)(item({ objectId: 38689557, objectClassId: 68725, objectName: '#package$', objectPath: '\\#package$', packagePath: 'Консультант' }), 'C:\\OE\\trunk\\packages\\Консультант\\#package$.pkf', objects);
        assert.equal(issues.length, 1);
        assert.deepEqual(objects, [{ objectId: 3200004, objectName: 'Выполнение действия по ЖЦ', objectType: 'ТипДействияНадОбьектом' }]);
        assert.equal(issues[0]?.message, 'Объект «Выполнение действия по ЖЦ» (ID 3200004) попал в #package$.pkf — извлеките его из этого файла');
    });
    test('recognizes the physical placeholder filename regardless of its object class', () => {
        assert.equal((0, packageSyncIssues_1.isPackagePlaceholderItem)(item({ objectClassId: 68725, localPath: 'C:\\OE\\trunk\\packages\\Консультант\\#PACKAGE$.pkf' })), true);
        assert.equal((0, packageSyncIssues_1.isPackagePlaceholderItem)(item({ objectClassId: 68725, objectPath: '\\#package$' })), true);
        assert.equal((0, packageSyncIssues_1.isPackagePlaceholderItem)(item({ objectClassId: 10, localPath: 'C:\\OE\\trunk\\packages\\Консультант\\Ссылки.pkf' })), false);
    });
});
function item(overrides) {
    return {
        objectId: 1, objectClassId: 10, objectSeniorId: null, objectName: 'Ссылка', contentMd5: '', contentRevision: null,
        changeState: '1', changedAt: '', changedBy: 'Пользователь', objectPath: '', packagePath: '', ...overrides,
    };
}
//# sourceMappingURL=packageSyncIssues.test.js.map