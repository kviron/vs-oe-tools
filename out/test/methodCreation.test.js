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
const methodCreation_1 = require("../features/methods/methodCreation");
suite('Class method creation', () => {
    const captured = {
        ownerClassId: 3200139,
        name: 'acDeleteObjectExecute',
        visibilityId: 12450286,
        methodType: 3,
        methodKind: 0,
        signature: '',
        code: 'proc()\r\nbegin\r\n\r\nend;',
    };
    test('serializes the native creation audit contract and derives Signature from Code', () => {
        assert.equal((0, methodCreation_1.serializeMethodCreationAuditValues)(captured), '103,acDeleteObjectExecute,71,12450286,123,3,1800,0,69,"()",127,"proc()\r\nbegin\r\n\r\nend;",102,3200139');
    });
    test('normalizes line endings and accepts the default interpreted method', () => {
        const normalized = (0, methodCreation_1.normalizeClassMethodDraft)({ ...captured, name: ' acTest ', code: 'proc()\nbegin\nend;' });
        assert.equal(normalized.name, 'acTest');
        assert.equal(normalized.code, 'proc()\r\nbegin\r\nend;');
        assert.equal(normalized.signature, '()');
        assert.doesNotThrow(() => (0, methodCreation_1.validateClassMethodDraft)({ ...captured, code: methodCreation_1.defaultMethodCode }));
    });
    test('accepts and preserves an interpreted class procedure', () => {
        const classProcedure = { ...captured, methodKind: methodCreation_1.classProcedureMethodKind };
        assert.doesNotThrow(() => (0, methodCreation_1.validateClassMethodDraft)(classProcedure));
        assert.match((0, methodCreation_1.serializeMethodCreationAuditValues)(classProcedure), /1800,6/);
    });
    test('rejects unsupported method types and invalid names', () => {
        assert.throws(() => (0, methodCreation_1.validateClassMethodDraft)({ ...captured, name: 'bad name' }), /Имя метода/);
        assert.throws(() => (0, methodCreation_1.validateClassMethodDraft)({ ...captured, methodType: 1 }), /интерпретируемых/);
        assert.throws(() => (0, methodCreation_1.validateClassMethodDraft)({ ...captured, code: 'begin\r\nend;' }), /анонимного/);
    });
});
//# sourceMappingURL=methodCreation.test.js.map