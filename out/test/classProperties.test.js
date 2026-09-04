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
const classProperties_1 = require("../mcp/classProperties");
suite('MCP class properties', () => {
    test('keeps the nearest property unless shadowed definitions are requested', () => {
        const derived = property('Caption', 0);
        const ancestor = property('caption', 2);
        assert.deepEqual((0, classProperties_1.selectVisibleProperties)([derived, ancestor], false), [derived]);
        assert.deepEqual((0, classProperties_1.selectVisibleProperties)([derived, ancestor], true), [derived, ancestor]);
    });
});
function property(name, depth) {
    return {
        id: String(depth), name, aliases: '', ownerClassId: '1', ownerClassName: 'Owner',
        depth, inherited: depth > 0, type: '', readOnly: true, visibility: 'Public', package: '_Система', isBinary: false,
    };
}
//# sourceMappingURL=classProperties.test.js.map