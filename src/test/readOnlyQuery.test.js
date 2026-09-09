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
const readOnlyQuery_1 = require("../mcp/readOnlyQuery");
suite('MCP read-only query guard', () => {
    test('accepts SELECT and adds a bounded outer limit', () => {
        const query = (0, readOnlyQuery_1.prepareReadOnlyQuery)('-- inspect\nSELECT id FROM classes;', 25);
        assert.match(query, /SELECT id FROM classes/);
        assert.match(query, /LIMIT 26$/);
    });
    test('accepts WITH queries', () => {
        assert.match((0, readOnlyQuery_1.prepareReadOnlyQuery)('WITH data AS (SELECT 1 AS id) SELECT * FROM data'), /WITH data/);
    });
    test('rejects mutation statements', () => {
        for (const sql of ['UPDATE classes SET name = name', 'DELETE FROM classes', 'INSERT INTO classes DEFAULT VALUES', 'DROP TABLE classes']) {
            assert.throws(() => (0, readOnlyQuery_1.prepareReadOnlyQuery)(sql), /Only SELECT/);
        }
    });
    test('caps the requested row limit', () => {
        assert.match((0, readOnlyQuery_1.prepareReadOnlyQuery)('VALUES (1)', 9999), /LIMIT 501$/);
    });
});
//# sourceMappingURL=readOnlyQuery.test.js.map