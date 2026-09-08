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
const attributeCreation_1 = require("../features/classes/attributeCreation");
suite('Class attribute creation', () => {
    const captured = {
        ownerClassId: 3200139,
        name: 'аКонтекстПоКлассу',
        aliases: 'aKontekstPoKlassu',
        dbFieldName: 'aKontekstPoKlassu',
        attributeTypeId: 330,
        valueClasses: '10010632',
        visibilityId: 12450284,
        distributionModeId: 12450505,
        isNotNull: false,
        virtual: true,
        refIntegrityCheck: false,
    };
    test('serializes the exact field contract observed in SQL monitor', () => {
        assert.equal((0, attributeCreation_1.serializeClassAttributeAuditValues)(captured), '102,3200139,103,аКонтекстПоКлассу,121,aKontekstPoKlassu,71,12450284,112,aKontekstPoKlassu,113,330,115,0,1300,10010632,1313,12450505,1341,-1,12450030,0');
    });
    test('normalizes and deduplicates value class IDs', () => {
        assert.deepEqual((0, attributeCreation_1.parseValueClassIds)('10010632, 10010632, 77'), [10010632, 77]);
        assert.equal((0, attributeCreation_1.normalizeClassAttributeDraft)({ ...captured, valueClasses: '10010632, 77' }).valueClasses, '10010632,77');
    });
    test('allows a virtual attribute without a database field', () => {
        const withoutDatabaseField = { ...captured, dbFieldName: '' };
        assert.doesNotThrow(() => (0, attributeCreation_1.validateClassAttributeDraft)(withoutDatabaseField));
        assert.equal((0, attributeCreation_1.serializeClassAttributeAuditValues)(withoutDatabaseField), '102,3200139,103,аКонтекстПоКлассу,121,aKontekstPoKlassu,71,12450284,113,330,115,0,1300,10010632,1313,12450505,1341,-1,12450030,0');
    });
    test('still rejects a malformed non-empty database field', () => {
        assert.throws(() => (0, attributeCreation_1.validateClassAttributeDraft)({ ...captured, dbFieldName: 'Плохое поле' }), /SQL-идентификатор/);
    });
    test('rejects physical attributes until table DDL is captured', () => {
        assert.throws(() => (0, attributeCreation_1.validateClassAttributeDraft)({ ...captured, virtual: false }), /только виртуальных/);
    });
});
//# sourceMappingURL=attributeCreation.test.js.map