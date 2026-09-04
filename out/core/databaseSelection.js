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
exports.getDatabaseSelectionPath = getDatabaseSelectionPath;
exports.writeDatabaseSelection = writeDatabaseSelection;
exports.readDatabaseSelection = readDatabaseSelection;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
function getDatabaseSelectionPath(storagePath, workspacePath) {
    const workspaceId = (0, node_crypto_1.createHash)('sha256').update(path.resolve(workspacePath).toLowerCase()).digest('hex').slice(0, 16);
    return path.join(storagePath, `database-selection-${workspaceId}.json`);
}
async function writeDatabaseSelection(selectionPath, workspacePath, profile) {
    await (0, promises_1.mkdir)(path.dirname(selectionPath), { recursive: true });
    await (0, promises_1.writeFile)(selectionPath, JSON.stringify({ workspacePath, profile, updatedAt: new Date().toISOString() }), 'utf8');
}
async function readDatabaseSelection(selectionPath) {
    return JSON.parse(await (0, promises_1.readFile)(selectionPath, 'utf8'));
}
//# sourceMappingURL=databaseSelection.js.map