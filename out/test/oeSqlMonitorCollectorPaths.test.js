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
const path = __importStar(require("node:path"));
const oeSqlMonitorCollectorPaths_1 = require("../features/sql-monitor/oeSqlMonitorCollectorPaths");
suite('OESQLMonCon collector paths', () => {
    test('uses configured collector before workspace and R306 fallbacks', () => {
        const workspace = path.join('C:', 'OE', 'trunk');
        assert.deepEqual((0, oeSqlMonitorCollectorPaths_1.getSqlMonitorCollectorCandidates)(workspace, path.join('C:', 'tools', 'sql-monitor')), [
            path.resolve(workspace, path.join('C:', 'tools', 'sql-monitor'), 'OESQLMonCon.exe'),
            path.join(workspace, 'bin', 'OESQLMonCon.exe'),
            path.join(path.dirname(workspace), 'R306', 'bin', 'OESQLMonCon.exe'),
        ]);
    });
    test('does not duplicate the standard collector when explicitly configured', () => {
        const workspace = path.join('C:', 'OE', 'trunk');
        const standard = path.join(workspace, 'bin', 'OESQLMonCon.exe');
        assert.equal((0, oeSqlMonitorCollectorPaths_1.getSqlMonitorCollectorCandidates)(workspace, standard).length, 2);
    });
    test('recognizes the localized protocol mismatch', () => {
        assert.equal((0, oeSqlMonitorCollectorPaths_1.isProtocolVersionMismatch)(new Error('Exception: Неверная версия протокола данных 157.0, ожидается 154.0')), true);
        assert.equal((0, oeSqlMonitorCollectorPaths_1.isProtocolVersionMismatch)(new Error('ECONNREFUSED')), false);
    });
});
//# sourceMappingURL=oeSqlMonitorCollectorPaths.test.js.map