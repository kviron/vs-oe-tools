import type { SqlCompletionSchema } from '../../features/sql-executor/sqlCompletionSchema';
import type { SerializedQueryResult } from '../queryResult';
import type { SqlQueryRecord } from '../sqlQuery';
import {
	isCopyTableCellsMessage,
	isTableSelectionDebugMessage,
	type CopyTableCellsMessage,
	type TableSelectionDebugMessage,
} from './commonMessages';

export type SqlMonitorWebviewMessage =
	| { command: 'sqlMonitorReady' }
	| { command: 'clearSqlMonitor' }
	| { command: 'setSqlMonitorPaused'; paused: boolean }
	| TableSelectionDebugMessage
	| CopyTableCellsMessage;

export type SqlMonitorHostMessage =
	| { command: 'sqlMonitorSnapshot'; records: SqlQueryRecord[]; paused: boolean }
	| { command: 'sqlQueryChanged'; record: SqlQueryRecord }
	| { command: 'sqlMonitorPaused'; paused: boolean }
	| { command: 'sqlMonitorCleared' };

export interface SqlHistoryEntry {
	id: number;
	startedAt: string;
	source: string;
	operation: SqlQueryRecord['operation'];
	text: string;
}

export type SqlExecutorWebviewMessage =
	| { command: 'sqlExecutorReady' }
	| { command: 'executeSql'; text: string }
	| { command: 'copySqlResult'; format: 'markdown' | 'json' }
	| { command: 'copySqlError'; text: string }
	| { command: 'openQuickNavigation'; id: number }
	| { command: 'exportSqlResult' }
	| TableSelectionDebugMessage
	| CopyTableCellsMessage;

export type SqlExecutorHostMessage =
	| { command: 'sqlExecutorInitialized'; history: SqlHistoryEntry[] }
	| { command: 'sqlCompletionSchemaLoaded'; completion: SqlCompletionSchema }
	| { command: 'sqlExecutorHistoryChanged'; entry: SqlHistoryEntry }
	| { command: 'sqlExecutionSucceeded'; result: SerializedQueryResult; durationMs: number; database: string }
	| { command: 'sqlExecutionFailed'; message: string; details: string };

export function isSqlMonitorWebviewMessage(message: unknown): message is SqlMonitorWebviewMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& (message.command === 'sqlMonitorReady'
			|| message.command === 'clearSqlMonitor'
			|| (message.command === 'setSqlMonitorPaused' && 'paused' in message && typeof message.paused === 'boolean')
			|| isTableSelectionDebugMessage(message)
			|| isCopyTableCellsMessage(message));
}

export function isSqlExecutorWebviewMessage(message: unknown): message is SqlExecutorWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	if (message.command === 'sqlExecutorReady') { return true; }
	if (isTableSelectionDebugMessage(message) || isCopyTableCellsMessage(message)) { return true; }
	if (message.command === 'executeSql') {
		return 'text' in message && typeof message.text === 'string';
	}
	if (message.command === 'copySqlResult') {
		return 'format' in message && (message.format === 'markdown' || message.format === 'json');
	}
	if (message.command === 'copySqlError') {
		return 'text' in message && typeof message.text === 'string';
	}
	if (message.command === 'openQuickNavigation') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0;
	}
	return message.command === 'exportSqlResult';
}
