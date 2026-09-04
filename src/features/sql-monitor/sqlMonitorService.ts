import type { SqlQueryRecord } from './models';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

type SqlMonitorListener = (record: SqlQueryRecord) => void;

const recordLimit = 100;

class SqlMonitorService {
	private readonly records: SqlQueryRecord[] = [];
	private readonly listeners = new Set<SqlMonitorListener>();
	private nextId = 1;
	private persistencePath: string | undefined;
	private persistQueue = Promise.resolve();
	private persistTimer: ReturnType<typeof setTimeout> | undefined;

	public async initialize(persistencePath: string): Promise<void> {
		this.persistencePath = persistencePath;
		try {
			const stored = JSON.parse(await readFile(persistencePath, 'utf8')) as unknown;
			if (Array.isArray(stored)) {
				const records = stored.filter(isSqlQueryRecord).slice(-recordLimit);
				this.records.splice(0, this.records.length, ...records);
				this.nextId = Math.max(0, ...records.map(record => record.id)) + 1;
			}
		} catch { /* The history file is created on the first query. */ }
	}

	public start(record: Omit<SqlQueryRecord, 'id'>): SqlQueryRecord {
		const entry = { ...record, id: this.nextId++ };
		this.records.push(entry);
		this.trim();
		this.emit(entry);
		this.schedulePersist();
		return entry;
	}

	public update(id: number, changes: Partial<SqlQueryRecord>): void {
		const entry = this.records.find(candidate => candidate.id === id);
		if (!entry) {
			return;
		}
		Object.assign(entry, changes);
		this.emit(entry);
		this.schedulePersist();
	}

	public getRecords(): SqlQueryRecord[] {
		return this.records.map(record => ({ ...record, rows: [...record.rows], parameters: [...record.parameters] }));
	}

	public clear(): void {
		this.records.length = 0;
		this.schedulePersist();
	}

	public setActive(_active: boolean): void { this.trim(); }

	public subscribe(listener: SqlMonitorListener): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	private trim(): void {
		if (this.records.length > recordLimit) {
			this.records.splice(0, this.records.length - recordLimit);
		}
	}

	private schedulePersist(): void {
		if (!this.persistencePath || this.persistTimer) { return; }
		this.persistTimer = setTimeout(() => {
			this.persistTimer = undefined;
			const snapshot = this.records.map(record => ({ ...record, rows: [] }));
			this.persistQueue = this.persistQueue
				.then(async () => {
					await mkdir(path.dirname(this.persistencePath!), { recursive: true });
					await writeFile(this.persistencePath!, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
				})
				.catch(() => undefined);
		}, 50);
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

function isSqlQueryRecord(value: unknown): value is SqlQueryRecord {
	return typeof value === 'object' && value !== null
		&& 'id' in value && typeof value.id === 'number'
		&& 'startedAt' in value && typeof value.startedAt === 'string'
		&& 'source' in value && typeof value.source === 'string'
		&& 'text' in value && typeof value.text === 'string'
		&& 'rows' in value && Array.isArray(value.rows)
		&& 'parameters' in value && Array.isArray(value.parameters);
}
