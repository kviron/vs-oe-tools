"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlMonitorService = void 0;
const closedLimit = 10;
const openLimit = 1000;
class SqlMonitorService {
    records = [];
    listeners = new Set();
    nextId = 1;
    active = false;
    start(record) {
        const entry = { ...record, id: this.nextId++ };
        this.records.push(entry);
        this.trim();
        this.emit(entry);
        return entry;
    }
    update(id, changes) {
        const entry = this.records.find(candidate => candidate.id === id);
        if (!entry) {
            return;
        }
        Object.assign(entry, changes);
        this.emit(entry);
    }
    getRecords() {
        return this.records.map(record => ({ ...record, rows: [...record.rows], parameters: [...record.parameters] }));
    }
    clear() {
        this.records.length = 0;
    }
    setActive(active) {
        this.active = active;
        this.trim();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
    trim() {
        const limit = this.active ? openLimit : closedLimit;
        if (this.records.length > limit) {
            this.records.splice(0, this.records.length - limit);
        }
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
//# sourceMappingURL=sqlMonitorService.js.map