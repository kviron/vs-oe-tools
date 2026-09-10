import type { SqlResultValue } from './queryResult';

export type SqlOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'OTHER';
export type SqlQueryStatus = 'running' | 'success' | 'error';
export type SqlMonitorValue = SqlResultValue;

export interface SqlQueryRecord {
	id: number;
	startedAt: string;
	source: string;
	database: string;
	operation: SqlOperation;
	status: SqlQueryStatus;
	text: string;
	parameters: SqlResultValue[];
	durationMs?: number;
	rowCount?: number;
	columns: string[];
	rows: Record<string, SqlResultValue>[];
	resultTruncated: boolean;
	error?: string;
	externalQueryId?: number;
	externalFingerprint?: string;
	userId?: number;
	userName?: string;
	computerName?: string;
	threadId?: number;
	sqlPattern?: string;
	creationTimeLabel?: string;
	firstTable?: string;
	openTimeMs?: number;
	execTimeMs?: number;
}

export interface QueryMonitor {
	start(record: Omit<SqlQueryRecord, 'id'>): SqlQueryRecord;
	update(id: number, changes: Partial<SqlQueryRecord>): void;
}

export interface QueryMonitorSource {
	subscribe(listener: (record: SqlQueryRecord) => void): { dispose(): void };
}
