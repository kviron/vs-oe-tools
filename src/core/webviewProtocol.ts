import type { ClassAttribute, ClassDetails, ClassMethod, ClassTreeRow } from '../features/classes/models';
import type { SqlQueryRecord } from '../features/sql-monitor/models';
import type { SerializedQueryResult } from '../infrastructure/database/databaseQueryExecutor';

export type ExplorerWebviewMessage =
	| { command: 'loadClasses' }
	| { command: 'openClass'; id: number; pinned: boolean }
	| { command: 'selectExplorerEntity'; id?: number }
	| { command: 'setExplorerCopyContext'; active: boolean }
	| { command: 'explorerDebugLog'; message: string }
	| CopyEntityIdMessage;

export type ExplorerHostMessage =
	| { command: 'classesLoaded'; classes: ClassTreeRow[] }
	| { command: 'classesLoadFailed'; message: string }
	| { command: 'resetClasses' };

export type ClassDetailsWebviewMessage =
	| { command: 'classDetailsReady' }
	| { command: 'loadClassAttributes' }
	| { command: 'loadClassMethods'; includeInherited: boolean }
	| { command: 'openMethod'; id: number }
	| CopyEntityIdMessage;

export interface CopyEntityIdMessage {
	command: 'copyEntityId';
	id: number | string;
}
export type ClassDetailsHostMessage =
	| { command: 'classDetailsLoaded'; details: ClassDetails }
	| { command: 'classAttributesLoaded'; attributes: ClassAttribute[] }
	| { command: 'classAttributesLoadFailed'; message: string }
	| { command: 'classMethodsLoaded'; methods: ClassMethod[]; includeInherited: boolean }
	| { command: 'classMethodsLoadFailed'; message: string; includeInherited: boolean };
export type SqlMonitorWebviewMessage =
	| { command: 'sqlMonitorReady' }
	| { command: 'clearSqlMonitor' };
export type SqlMonitorHostMessage =
	| { command: 'sqlMonitorSnapshot'; records: SqlQueryRecord[] }
	| { command: 'sqlQueryChanged'; record: SqlQueryRecord }
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
	| { command: 'executeSql'; text: string };
export type SqlExecutorHostMessage =
	| { command: 'sqlExecutorInitialized'; history: SqlHistoryEntry[] }
	| { command: 'sqlExecutorHistoryChanged'; entry: SqlHistoryEntry }
	| { command: 'sqlExecutionSucceeded'; result: SerializedQueryResult; durationMs: number; database: string }
	| { command: 'sqlExecutionFailed'; message: string };
export type WebviewMessage = ExplorerWebviewMessage | ClassDetailsWebviewMessage | SqlMonitorWebviewMessage | SqlExecutorWebviewMessage;

export function isClassDetailsWebviewMessage(message: unknown): message is ClassDetailsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'classDetailsReady' || message.command === 'loadClassAttributes') {
		return true;
	}
	if (message.command === 'openMethod') {
		return 'id' in message && typeof message.id === 'number';
	}
	if (isCopyEntityIdMessage(message)) {
		return true;
	}
	return message.command === 'loadClassMethods'
		&& 'includeInherited' in message
		&& typeof message.includeInherited === 'boolean';
}

export function isExplorerWebviewMessage(message: unknown): message is ExplorerWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'loadClasses') {
		return true;
	}
	if (message.command === 'selectExplorerEntity') {
		return !('id' in message) || message.id === undefined || typeof message.id === 'number';
	}
	if (message.command === 'explorerDebugLog') {
		return 'message' in message && typeof message.message === 'string';
	}
	if (message.command === 'setExplorerCopyContext') {
		return 'active' in message && typeof message.active === 'boolean';
	}
	if (isCopyEntityIdMessage(message)) {
		return true;
	}
	return message.command === 'openClass' && 'id' in message && 'pinned' in message
		&& typeof message.id === 'number' && typeof message.pinned === 'boolean';
}

export function isCopyEntityIdMessage(message: unknown): message is CopyEntityIdMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& message.command === 'copyEntityId'
		&& 'id' in message
		&& (typeof message.id === 'number' || typeof message.id === 'string');
}

export function isSqlMonitorWebviewMessage(message: unknown): message is SqlMonitorWebviewMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& (message.command === 'sqlMonitorReady' || message.command === 'clearSqlMonitor');
}

export function isSqlExecutorWebviewMessage(message: unknown): message is SqlExecutorWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'sqlExecutorReady') {
		return true;
	}
	return message.command === 'executeSql' && 'text' in message && typeof message.text === 'string';
}
