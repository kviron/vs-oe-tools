import type { SqlQueryRecord } from './models';

type SqlMonitorListener = (record: SqlQueryRecord) => void;

const closedLimit = 10;
const openLimit = 1000;

class SqlMonitorService {
	private readonly records: SqlQueryRecord[] = [];
	private readonly listeners = new Set<SqlMonitorListener>();
	private nextId = 1;
	private active = false;

	public start(record: Omit<SqlQueryRecord, 'id'>): SqlQueryRecord {
		const entry = { ...record, id: this.nextId++ };
		this.records.push(entry);
		this.trim();
		this.emit(entry);
		return entry;
	}

	public update(id: number, changes: Partial<SqlQueryRecord>): void {
		const entry = this.records.find(candidate => candidate.id === id);
		if (!entry) {
			return;
		}
		Object.assign(entry, changes);
		this.emit(entry);
	}

	public getRecords(): SqlQueryRecord[] {
		return this.records.map(record => ({ ...record, rows: [...record.rows], parameters: [...record.parameters] }));
	}

	public clear(): void {
		this.records.length = 0;
	}

	public setActive(active: boolean): void {
		this.active = active;
		this.trim();
	}

	public subscribe(listener: SqlMonitorListener): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	private trim(): void {
		const limit = this.active ? openLimit : closedLimit;
		if (this.records.length > limit) {
			this.records.splice(0, this.records.length - limit);
		}
	}

	private emit(record: SqlQueryRecord): void {
		for (const listener of this.listeners) {
			try {
				listener(record);
			} catch {
				// Monitoring must never interrupt the database operation being observed.
			}
		}
	}
}

export const sqlMonitorService = new SqlMonitorService();
