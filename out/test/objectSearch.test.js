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
const objectSearch_1 = require("../core/objectSearch");
suite('Database object search', () => {
    test('classifies known entity tables before generic objects', () => {
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({ ismethod: true })).kind, 'method');
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({ isattribute: true })).kind, 'attribute');
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({ isclass: true })).kind, 'class');
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({})).kind, 'object');
    });
    test('preserves owner and package context', () => {
        const result = (0, objectSearch_1.mapDatabaseObject)(row({ ownername: 'Contract', ownerid: 20, ownerclassname: 'Class', packagename: '_System' }));
        assert.equal(result.ownerId, '20');
        assert.equal(result.packageName, '_System');
    });
    test('recognizes lifecycle objects by meta-class', () => {
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({ metaclassname: 'ЖизненныйЦикл' })).kind, 'lifecycle');
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({ metaclassname: 'Журнал документов' })).kind, 'journal');
        assert.equal((0, objectSearch_1.mapDatabaseObject)(row({ metaclassname: 'Список' })).kind, 'list');
    });
});
function row(overrides) {
    return { id: 25, classid: 5, seniorid: 20, name: 'Run', metaclassname: 'Method', ownername: null, ownerid: null, ownerclassname: null, packagename: null, bmpid: null, isclass: false, ismethod: false, isattribute: false, ...overrides };
}
//# sourceMappingURL=objectSearch.test.js.map