export type SqlOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'OTHER';
export type SqlQueryStatus = 'running' | 'success' | 'error';
export type SqlMonitorValue = string | number | boolean | null;

export interface SqlQueryRecord {
	id: number;
	startedAt: string;
	source: string;
	database: string;
	operation: SqlOperation;
	status: SqlQueryStatus;
	text: string;
	parameters: SqlMonitorValue[];
	durationMs?: number;
	rowCount?: number;
	columns: string[];
	rows: Record<string, SqlMonitorValue>[];
	resultTruncated: boolean;
	error?: string;
}

