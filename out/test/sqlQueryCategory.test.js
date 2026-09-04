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
const queryCategory_1 = require("../features/sql-monitor/queryCategory");
suite('SQL query categories', () => {
    test('recognizes East Express metadata chatter', () => {
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'SELECT COUNT(id) FROM ObjectMetaDataMap WHERE SeniorID = 1', firstTable: 'ObjectMetaDataMap' }), 'metadata');
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'SELECT Code FROM Methods WHERE id = 1', firstTable: 'Methods' }), 'metadata');
    });
    test('recognizes transaction and system traffic', () => {
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'ROLLBACK TL=0' }), 'transaction');
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'SELECT aStartID FROM OE_SYSTEM_GENGUID_ENUM_RANGES_V3(1, 2, 3)', firstTable: 'OE_SYSTEM_GENGUID_ENUM_RANGES_V3' }), 'system');
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'COPY "logusercolumnsoptionsusage" FROM STDIN CSV' }), 'system');
    });
    test('keeps domain queries visible by default', () => {
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'SELECT * FROM SimpleObjectAction', firstTable: 'SimpleObjectAction' }), 'application');
        assert.equal((0, queryCategory_1.classifySqlQuery)({ text: 'SELECT * FROM СправкаПоОбъекту', firstTable: 'СправкаПоОбъекту' }), 'application');
    });
});
//# sourceMappingURL=sqlQueryCategory.test.js.map