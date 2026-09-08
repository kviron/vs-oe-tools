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
exports.getSqlMonitorCollectorCandidates = getSqlMonitorCollectorCandidates;
exports.isProtocolVersionMismatch = isProtocolVersionMismatch;
const path = __importStar(require("node:path"));
function getSqlMonitorCollectorCandidates(workspacePath, configuredPath) {
    const candidates = [
        normalizeConfiguredPath(workspacePath, configuredPath),
        path.join(workspacePath, 'bin', 'OESQLMonCon.exe'),
        path.join(path.dirname(workspacePath), 'R306', 'bin', 'OESQLMonCon.exe'),
    ].filter((candidate) => Boolean(candidate));
    const seen = new Set();
    return candidates.filter(candidate => {
        const key = candidate.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function normalizeConfiguredPath(workspacePath, configuredPath) {
    const value = configuredPath.trim();
    if (!value) {
        return undefined;
    }
    const resolved = path.resolve(workspacePath, value);
    return path.extname(resolved).toLowerCase() === '.exe' ? resolved : path.join(resolved, 'OESQLMonCon.exe');
}
function isProtocolVersionMismatch(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /Неверная версия протокола данных|invalid data protocol version/i.test(message);
}
//# sourceMappingURL=oeSqlMonitorCollectorPaths.js.map