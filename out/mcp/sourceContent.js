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
exports.maximumSourceLineLimit = exports.defaultSourceLineLimit = void 0;
exports.decodeSourceValue = decodeSourceValue;
exports.createSourceExcerpt = createSourceExcerpt;
const iconv = __importStar(require("iconv-lite"));
exports.defaultSourceLineLimit = 1000;
exports.maximumSourceLineLimit = 5000;
function decodeSourceValue(value) {
    if (Buffer.isBuffer(value)) {
        return iconv.decode(value, 'win1251');
    }
    const text = value == null ? '' : String(value);
    const bytea = text.match(/^\\x([\da-f]+)$/i);
    return bytea && bytea[1].length % 2 === 0
        ? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251')
        : text;
}
function createSourceExcerpt(source, requestedStartLine = 1, requestedMaxLines = exports.defaultSourceLineLimit) {
    const lines = source.split(/\r?\n/);
    const totalLines = lines.length;
    const startLine = Math.min(Math.max(Math.trunc(requestedStartLine), 1), totalLines);
    const maxLines = Math.min(Math.max(Math.trunc(requestedMaxLines), 1), exports.maximumSourceLineLimit);
    const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
    const endLine = startLine + selected.length - 1;
    const width = String(endLine).length;
    return {
        text: selected.map((line, index) => `${String(startLine + index).padStart(width, ' ')} | ${line}`).join('\n'),
        totalLines,
        startLine,
        endLine,
        truncated: startLine > 1 || endLine < totalLines,
    };
}
//# sourceMappingURL=sourceContent.js.map