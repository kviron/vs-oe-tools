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
const methodResolution_1 = require("../mcp/methodResolution");
suite('MCP method reference resolution', () => {
    test('prefers the nearest implementation in the caller inheritance chain', () => {
        const result = (0, methodResolution_1.resolveMethodCandidates)([candidate('1', '10'), candidate('2', '20')], new Map([['10', 0], ['20', 1]]), new Map(), false);
        assert.equal(result.selected?.methodId, '1');
        assert.equal(result.confidence, 'high');
    });
    test('prefers the qualifier type over the caller class', () => {
        const result = (0, methodResolution_1.resolveMethodCandidates)([candidate('1', '10'), candidate('2', '30')], new Map([['10', 0]]), new Map([['30', 0]]), true);
        assert.equal(result.selected?.methodId, '2');
    });
    test('reports equally ranked overloads as ambiguous', () => {
        const result = (0, methodResolution_1.resolveMethodCandidates)([candidate('1', '10'), candidate('2', '10')], new Map([['10', 0]]), new Map(), false);
        assert.equal(result.ambiguous, true);
        assert.equal(result.selected, null);
    });
    test('uses argument count to rank overloads', () => {
        const one = candidate('1', '10', 'Save(value: Integer)');
        const two = candidate('2', '10', 'Save(key: String, value: Integer)');
        const result = (0, methodResolution_1.resolveMethodCandidates)([two, one], new Map([['10', 0]]), new Map(), false, 1);
        assert.equal(result.selected?.methodId, '1');
        assert.equal((0, methodResolution_1.signatureArgumentCount)('Run(Map<A, B>, 2)'), 2);
        assert.equal((0, methodResolution_1.signatureArgumentCount)('Run(const key: String; value: Integer)'), 2);
    });
});
function candidate(methodId, classId, signature = 'Run()') {
    return { methodId, methodName: 'Run', classId, className: `Class${classId}`, signature };
}
//# sourceMappingURL=methodResolution.test.js.map