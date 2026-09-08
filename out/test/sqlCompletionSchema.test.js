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
const sqlCompletionSchema_1 = require("../features/sql-executor/sqlCompletionSchema");
suite('SQL completion schema', () => {
    test('groups columns by schema and table and selects public by default', () => {
        assert.deepEqual((0, sqlCompletionSchema_1.buildSqlCompletionSchema)([
            { table_schema: 'audit', table_name: 'events', column_name: 'id' },
            { table_schema: 'public', table_name: 'users', column_name: 'id' },
            { table_schema: 'public', table_name: 'users', column_name: 'name' },
            { table_schema: 'public', table_name: 'roles', column_name: 'id' },
        ]), {
            schema: {
                audit: { events: ['id'] },
                public: { users: ['id', 'name'], roles: ['id'] },
            },
            defaultSchema: 'public',
        });
    });
    test('completes alias columns even when FROM appears after the cursor', async () => {
        const document = 'SELECT creator_log. FROM logcchangedobject AS creator_log';
        const position = document.indexOf('.') + 1;
        const result = (0, sqlCompletionSchema_1.completeAliasColumns)(document, position, {
            schema: { public: { logcchangedobject: ['objid', 'objclassid', 'changedate'] } },
            defaultSchema: 'public',
        });
        assert.deepEqual(result, {
            from: position,
            table: 'logcchangedobject',
            columns: ['objid', 'objclassid', 'changedate'],
        });
    });
});
//# sourceMappingURL=sqlCompletionSchema.test.js.map