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
exports.sqlMonitorService = void 0;
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const recordLimit = 100;
class SqlMonitorService {
    records = [];
    listeners = new Set();
    nextId = 1;
    persistencePath;
    persistQueue = Promise.resolve();
    persistTimer;
    async initialize(persistencePath) {
        this.persistencePath = persistencePath;
        try {
            const stored = JSON.parse(await (0, promises_1.readFile)(persistencePath, 'utf8'));
            if (Array.isArray(stored)) {
                const records = stored.filter(isSqlQueryRecord).slice(-recordLimit);
                this.records.splice(0, this.records.length, ...records);
                this.nextId = Math.max(0, ...records.map(record => record.id)) + 1;
            }
        }
        catch { /* The history file is created on the first query. */ }
    }
    start(record) {
        const entry = { ...record, id: this.nextId++ };
        this.records.push(entry);
        this.trim();
        this.emit(entry);
        this.schedulePersist();
        return entry;
    }
    update(id, changes) {
        const entry = this.records.find(candidate => candidate.id === id);
        if (!entry) {
            return;
        }
        Object.assign(entry, changes);
        this.emit(entry);
        this.schedulePersist();
    }
    getRecords() {
        return this.records.map(record => ({ ...record, rows: [...record.rows], parameters: [...record.parameters] }));
    }
    clear() {
        this.records.length = 0;
        this.schedulePersist();
    }
    setActive(_active) { this.trim(); }
    subscribe(listener) {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
    trim() {
        if (this.records.length > recordLimit) {
            this.records.splice(0, this.records.length - recordLimit);
        }
    }
    schedulePersist() {
        if (!this.persistencePath || this.persistTimer) {
            return;
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = undefined;
            const snapshot = this.records.map(record => ({ ...record, rows: [] }));
            this.persistQueue = this.persistQueue
                .then(async () => {
                await (0, promises_1.mkdir)(path.dirname(this.persistencePath), { recursive: true });
                await (0, promises_1.writeFile)(this.persistencePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
            })
                .catch(() => undefined);
        }, 50);
    }
    emit(record) {
        for (const listener of this.listeners) {
            try {
                listener(record);
            }
            catch {
                // Monitoring must never interrupt the database operation being observed.
            }
        }
    }
}
exports.sqlMonitorService = new SqlMonitorService();
function isSqlQueryRecord(value) {
    return typeof value === 'object' && value !== null
        && 'id' in value && typeof value.id === 'number'
        && 'startedAt' in value && typeof value.startedAt === 'string'
        && 'source' in value && typeof value.source === 'string'
        && 'text' in value && typeof value.text === 'string'
        && 'rows' in value && Array.isArray(value.rows)
        && 'parameters' in value && Array.isArray(value.parameters);
}
//# sourceMappingURL=sqlMonitorService.js.map