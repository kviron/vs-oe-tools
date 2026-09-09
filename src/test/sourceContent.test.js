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
const iconv = __importStar(require("iconv-lite"));
const sourceContent_1 = require("../mcp/sourceContent");
suite('MCP source content', () => {
    test('decodes Windows-1251 buffers and PostgreSQL bytea text', () => {
        const source = 'процедура Проверка';
        const encoded = iconv.encode(source, 'win1251');
        assert.equal((0, sourceContent_1.decodeSourceValue)(encoded), source);
        assert.equal((0, sourceContent_1.decodeSourceValue)(`\\x${encoded.toString('hex')}`), source);
    });
    test('returns a numbered, pageable excerpt', () => {
        const excerpt = (0, sourceContent_1.createSourceExcerpt)('one\ntwo\nthree\nfour', 2, 2);
        assert.deepEqual(excerpt, {
            text: '2 | two\n3 | three',
            totalLines: 4,
            startLine: 2,
            endLine: 3,
            truncated: true,
        });
    });
    test('caps the number of returned lines', () => {
        const source = Array.from({ length: sourceContent_1.maximumSourceLineLimit + 2 }, (_, index) => String(index)).join('\n');
        const excerpt = (0, sourceContent_1.createSourceExcerpt)(source, 1, sourceContent_1.maximumSourceLineLimit + 100);
        assert.equal(excerpt.endLine, sourceContent_1.maximumSourceLineLimit);
        assert.equal(excerpt.truncated, true);
    });
});
//# sourceMappingURL=sourceContent.test.js.map