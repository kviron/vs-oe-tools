import type { AttributeDetails, ClassAttribute, ClassDetails, ClassMethod, ClassObjectsResult, ClassProperty, ClassTreeRow, ObjectViewResult, PropertyDetails } from '../features/classes/models';
import type { SqlQueryRecord } from '../features/sql-monitor/models';
import type { SerializedQueryResult } from '../infrastructure/database/databaseQueryExecutor';
import type { PackageSyncItem } from '../features/package-sync/models';
import type { DatabaseObjectKind, DatabaseObjectSearchResult } from './objectSearch';

export type ExplorerWebviewMessage =
	| { command: 'explorerReady' }
	| { command: 'explorerStateChanged'; activeTab: string; selectedClassId?: number }
	| { command: 'loadClasses' }
	| { command: 'searchDatabaseObjects'; query: string }
	| { command: 'openDatabaseObject'; id: number; kind: DatabaseObjectKind; pinned: boolean }
	| { command: 'openClass'; id: number; pinned: boolean }
	| { command: 'openClassObjects'; classId: number }
	| { command: 'viewObject'; id: number }
	| { command: 'viewEntityProperties'; id: number }
	| { command: 'openDfmEditor'; classId: number }
	| { command: 'openDfmPreview'; classId: number }
	| { command: 'selectExplorerEntity'; id?: number }
	| { command: 'setExplorerCopyContext'; active: boolean }
	| { command: 'explorerDebugLog'; message: string }
	| CopyEntityIdMessage
	| OpenClientEntityMessage;

export type ExplorerHostMessage =
	| { command: 'restoreExplorerState'; activeTab: string; selectedClassId?: number }
	| { command: 'classesLoaded'; classes: ClassTreeRow[] }
	| { command: 'classesLoadFailed'; message: string }
	| { command: 'revealClass'; id: number }
	| { command: 'resetClasses' }
	| { command: 'databaseObjectsLoading'; query: string }
	| { command: 'databaseObjectsLoaded'; query: string; objects: DatabaseObjectSearchResult[] }
	| { command: 'databaseObjectsLoadFailed'; query: string; message: string };

export type ClassDetailsWebviewMessage =
	| { command: 'classDetailsReady' }
	| { command: 'classDetailsStateChanged'; activeTab: string }
	| { command: 'loadClassAttributes'; includeInherited: boolean }
	| { command: 'loadClassMethods'; includeInherited: boolean }
	| { command: 'loadClassProperties'; includeInherited: boolean }
	| { command: 'openMethod'; id: number }
	| { command: 'openAttribute'; id: number }
	| { command: 'openProperty'; id: number }
	| { command: 'openClassObjects'; classId: number }
	| { command: 'viewObject'; id: number }
	| { command: 'viewEntityProperties'; id: number }
	| { command: 'methodSvnAction'; id: number; action: 'localDiff' | 'history' | 'blame' }
	| CopyTableCellsMessage
	| CopyEntityIdMessage
	| OpenClientEntityMessage
	| TableSelectionDebugMessage;

export interface CopyEntityIdMessage {
	command: 'copyEntityId';
	id: number | string;
}
export interface OpenClientEntityMessage {
	command: 'openClientEntity';
	role: 'main' | 'test';
	entityType: string;
	id: number;
}
export interface TableSelectionDebugMessage {
	command: 'tableSelectionDebug';
	message: string;
}
export interface CopyTableCellsMessage {
	command: 'copyTableCells';
	text: string;
}
export type ClassDetailsHostMessage =
	| { command: 'classDetailsLoaded'; details: ClassDetails; activeTab?: string }
	| { command: 'revealClassMethod'; methodId: number }
	| { command: 'classAttributesLoaded'; attributes: ClassAttribute[]; includeInherited: boolean }
	| { command: 'classAttributesLoadFailed'; message: string; includeInherited: boolean }
	| { command: 'classMethodsLoaded'; methods: ClassMethod[]; includeInherited: boolean }
	| { command: 'classMethodsLoadFailed'; message: string; includeInherited: boolean }
	| { command: 'classPropertiesLoaded'; properties: ClassProperty[]; includeInherited: boolean }
	| { command: 'classPropertiesLoadFailed'; message: string; includeInherited: boolean };
export type AttributeDetailsWebviewMessage = { command: 'attributeDetailsReady' };
export type AttributeDetailsHostMessage = { command: 'attributeDetailsLoaded'; details: AttributeDetails };
export type PropertyDetailsWebviewMessage = { command: 'propertyDetailsReady' };
export type PropertyDetailsHostMessage = { command: 'propertyDetailsLoaded'; details: PropertyDetails };
export type EntityPropertiesWebviewMessage = { command: 'entityPropertiesReady' };
export type EntityPropertiesHostMessage = { command: 'entityPropertiesLoaded'; result: ObjectViewResult };
export type ClassObjectsWebviewMessage =
	| { command: 'classObjectsReady' }
	| { command: 'refreshClassObjects' }
	| { command: 'loadMoreClassObjects'; offset: number }
	| { command: 'viewObject'; id: number }
	| { command: 'viewEntityProperties'; id: number }
	| CopyTableCellsMessage
	| CopyEntityIdMessage
	| OpenClientEntityMessage;
export type ClassObjectsHostMessage =
	| { command: 'classObjectsLoading'; append: boolean }
	| { command: 'classObjectsLoaded'; result: ClassObjectsResult; append: boolean }
	| { command: 'classObjectsLoadFailed'; message: string };
export type ObjectViewWebviewMessage =
	| { command: 'objectViewReady' }
	| { command: 'refreshObjectView' }
	| { command: 'copyObjectJson' }
	| CopyTableCellsMessage
	| TableSelectionDebugMessage;
export type ObjectViewHostMessage =
	| { command: 'objectViewLoading' }
	| { command: 'objectViewLoaded'; result: ObjectViewResult }
	| { command: 'objectViewLoadFailed'; message: string };
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
	| { command: 'exportSqlResult' }
	| TableSelectionDebugMessage
	| CopyTableCellsMessage;
export type SqlExecutorHostMessage =
	| { command: 'sqlExecutorInitialized'; history: SqlHistoryEntry[] }
	| { command: 'sqlExecutorHistoryChanged'; entry: SqlHistoryEntry }
	| { command: 'sqlExecutionSucceeded'; result: SerializedQueryResult; durationMs: number; database: string }
	| { command: 'sqlExecutionFailed'; message: string; details: string };
export type PackageSyncWebviewMessage =
	| { command: 'packageSyncReady' }
	| { command: 'refreshPackageSync' }
	| { command: 'openPackageSyncDiff'; objectId: number };
export type PackageSyncHostMessage =
	| { command: 'packageSyncLoading' }
	| { command: 'packageSyncLoaded'; items: PackageSyncItem[] }
	| { command: 'packageSyncFailed'; message: string };
export interface SettingsState {
	useFolderAsProjectRoot: boolean;
	databaseRole: 'main' | 'test';
	databaseProfile: string;
	databaseProfiles: Array<{ id: string; name: string; fields: Array<{ key: string; value: string }> }>;
	rdboadmPath?: string;
	rdboadmError?: string;
	userId: number;
	clientUsername: string;
	clientPasswordSet: boolean;
	mcpEnabled: boolean;
	mcpStatus: 'ready' | 'disabled' | 'unavailable';
	mcpStatusText: string;
	mcpConnectionCode: string;
	lastExtensionError?: { timestamp: string; source: string; message: string };
}
export type SettingsWebviewMessage =
	| { command: 'settingsReady' }
	| { command: 'setProjectRootEnabled'; enabled: boolean }
	| { command: 'setDatabaseRole'; role: 'main' | 'test' }
	| { command: 'setDatabaseProfile'; profile: string }
	| { command: 'saveDatabaseProfile'; profile: string; fields: Array<{ key: string; value: string }> }
	| { command: 'runProjectCommand'; action: 'updateDatabase' | 'startClient'; role: 'main' | 'test' }
	| { command: 'setUserId'; userId: number }
	| { command: 'setClientCredentials'; username: string; password?: string }
	| { command: 'setMcpEnabled'; enabled: boolean }
	| { command: 'testSettingsDatabaseConnection' }
	| { command: 'copyMcpConnectionCode'; text: string }
	| { command: 'clearExtensionLogs' };
export type SettingsHostMessage =
	| { command: 'settingsState'; state: SettingsState }
	| { command: 'databaseConnectionTestStarted' }
	| { command: 'databaseConnectionTestFinished'; success: boolean; message: string };
export type WebviewMessage = ExplorerWebviewMessage | ClassDetailsWebviewMessage | AttributeDetailsWebviewMessage | PropertyDetailsWebviewMessage | EntityPropertiesWebviewMessage | ClassObjectsWebviewMessage | ObjectViewWebviewMessage | SqlMonitorWebviewMessage | SqlExecutorWebviewMessage | CodeHistoryWebviewMessage | PackageSyncWebviewMessage | SettingsWebviewMessage;

export function isSettingsWebviewMessage(message: unknown): message is SettingsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'settingsReady' || message.command === 'testSettingsDatabaseConnection' || message.command === 'clearExtensionLogs') {
		return true;
	}
	if (message.command === 'setProjectRootEnabled' || message.command === 'setMcpEnabled') {
		return 'enabled' in message && typeof message.enabled === 'boolean';
	}
	if (message.command === 'setDatabaseRole') {
		return 'role' in message && (message.role === 'main' || message.role === 'test');
	}
	if (message.command === 'setDatabaseProfile') { return 'profile' in message && typeof message.profile === 'string'; }
	if (message.command === 'saveDatabaseProfile') { return 'profile' in message && typeof message.profile === 'string'
		&& 'fields' in message && Array.isArray(message.fields)
		&& message.fields.every(field => typeof field === 'object' && field !== null && 'key' in field && typeof field.key === 'string' && 'value' in field && typeof field.value === 'string'); }
	if (message.command === 'runProjectCommand') {
		return 'action' in message && (message.action === 'updateDatabase' || message.action === 'startClient')
			&& 'role' in message && (message.role === 'main' || message.role === 'test');
	}
	if (message.command === 'setUserId') {
		return 'userId' in message && typeof message.userId === 'number' && Number.isInteger(message.userId) && message.userId >= 0;
	}
	if (message.command === 'setClientCredentials') {
		return 'username' in message && typeof message.username === 'string'
			&& (!('password' in message) || message.password === undefined || typeof message.password === 'string');
	}
	return message.command === 'copyMcpConnectionCode' && 'text' in message && typeof message.text === 'string';
}

export function isPackageSyncWebviewMessage(message: unknown): message is PackageSyncWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {return false;}
	return message.command === 'packageSyncReady'
		|| message.command === 'refreshPackageSync'
		|| (message.command === 'openPackageSyncDiff' && 'objectId' in message && typeof message.objectId === 'number');
}

export interface CodeHistoryListEntry {
	id: string;
	kind: 'svn' | 'database';
	date: string;
	timestamp: number;
	user: string;
	computer: string;
	commit: string;
	commitOrder: number;
	comment: string;
}

export type CodeHistoryWebviewMessage =
	| { command: 'codeHistoryReady' }
	| { command: 'openCodeHistoryEntry'; id: string };

export type CodeHistoryHostMessage =
	| { command: 'codeHistoryLoading'; title: string }
	| { command: 'codeHistoryLoaded'; title: string; subtitle: string; entries: CodeHistoryListEntry[] }
	| { command: 'codeHistoryFailed'; title: string; message: string };

export function isCodeHistoryWebviewMessage(message: unknown): message is CodeHistoryWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	return message.command === 'codeHistoryReady'
		|| (message.command === 'openCodeHistoryEntry' && 'id' in message && typeof message.id === 'string');
}

export function isClassDetailsWebviewMessage(message: unknown): message is ClassDetailsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'classDetailsReady') {
		return true;
	}
	if (message.command === 'classDetailsStateChanged') {
		return 'activeTab' in message && typeof message.activeTab === 'string';
	}
	if (isTableSelectionDebugMessage(message)) {
		return true;
	}
	if (message.command === 'loadClassAttributes') {
		return 'includeInherited' in message && typeof message.includeInherited === 'boolean';
	}
	if (message.command === 'openMethod' || message.command === 'openAttribute' || message.command === 'openProperty') {
		return 'id' in message && typeof message.id === 'number';
	}
	if (message.command === 'openClassObjects') {
		return 'classId' in message && typeof message.classId === 'number' && Number.isSafeInteger(message.classId);
	}
	if (message.command === 'viewObject' || message.command === 'viewEntityProperties') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id);
	}
	if (message.command === 'copyTableCells') {
		return 'text' in message && typeof message.text === 'string';
	}
	if (message.command === 'methodSvnAction') {
		return 'id' in message && typeof message.id === 'number' && 'action' in message
			&& (message.action === 'localDiff' || message.action === 'history' || message.action === 'blame');
	}
	if (isCopyEntityIdMessage(message)) {
		return true;
	}
	if (isOpenClientEntityMessage(message)) {
		return true;
	}
	return (message.command === 'loadClassMethods' || message.command === 'loadClassProperties')
		&& 'includeInherited' in message
		&& typeof message.includeInherited === 'boolean';
}

export function isAttributeDetailsWebviewMessage(message: unknown): message is AttributeDetailsWebviewMessage {
	return typeof message === 'object' && message !== null && 'command' in message && message.command === 'attributeDetailsReady';
}

export function isPropertyDetailsWebviewMessage(message: unknown): message is PropertyDetailsWebviewMessage {
	return typeof message === 'object' && message !== null && 'command' in message && message.command === 'propertyDetailsReady';
}

export function isClassObjectsWebviewMessage(message: unknown): message is ClassObjectsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'loadMoreClassObjects') {
		return 'offset' in message && typeof message.offset === 'number' && Number.isInteger(message.offset) && message.offset >= 0;
	}
	if (message.command === 'viewObject' || message.command === 'viewEntityProperties') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id);
	}
	return message.command === 'classObjectsReady' || message.command === 'refreshClassObjects'
		|| isCopyTableCellsMessage(message) || isCopyEntityIdMessage(message) || isOpenClientEntityMessage(message);
}

export function isObjectViewWebviewMessage(message: unknown): message is ObjectViewWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	return message.command === 'objectViewReady'
		|| message.command === 'refreshObjectView'
		|| message.command === 'copyObjectJson'
		|| isCopyTableCellsMessage(message)
		|| isTableSelectionDebugMessage(message);
}

export function isExplorerWebviewMessage(message: unknown): message is ExplorerWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'loadClasses') {
		return true;
	}
	if (message.command === 'searchDatabaseObjects') {
		return 'query' in message && typeof message.query === 'string';
	}
	if (message.command === 'openDatabaseObject') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id)
			&& 'pinned' in message && typeof message.pinned === 'boolean'
			&& 'kind' in message && (message.kind === 'class' || message.kind === 'method' || message.kind === 'attribute' || message.kind === 'lifecycle' || message.kind === 'journal' || message.kind === 'list' || message.kind === 'object');
	}
	if (message.command === 'explorerReady') {
		return true;
	}
	if (message.command === 'explorerStateChanged') {
		return 'activeTab' in message && typeof message.activeTab === 'string'
			&& (!('selectedClassId' in message) || message.selectedClassId === undefined || typeof message.selectedClassId === 'number');
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
	if (isOpenClientEntityMessage(message)) {
		return true;
	}
	if (message.command === 'openDfmEditor' || message.command === 'openDfmPreview') {
		return 'classId' in message && typeof message.classId === 'number' && Number.isSafeInteger(message.classId);
	}
	if (message.command === 'openClassObjects') {
		return 'classId' in message && typeof message.classId === 'number' && Number.isSafeInteger(message.classId);
	}
	if (message.command === 'viewObject' || message.command === 'viewEntityProperties') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id);
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

export function isOpenClientEntityMessage(message: unknown): message is OpenClientEntityMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& message.command === 'openClientEntity'
		&& 'role' in message
		&& (message.role === 'main' || message.role === 'test')
		&& 'entityType' in message
		&& typeof message.entityType === 'string'
		&& message.entityType.trim().length > 0
		&& 'id' in message
		&& typeof message.id === 'number'
		&& Number.isSafeInteger(message.id);
}

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
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'sqlExecutorReady') {
		return true;
	}
	if (isTableSelectionDebugMessage(message)) {
		return true;
	}
	if (isCopyTableCellsMessage(message)) {
		return true;
	}
	if (message.command === 'executeSql') {
		return 'text' in message && typeof message.text === 'string';
	}
	if (message.command === 'copySqlResult') {
		return 'format' in message && (message.format === 'markdown' || message.format === 'json');
	}
	if (message.command === 'copySqlError') {
		return 'text' in message && typeof message.text === 'string';
	}
	return message.command === 'exportSqlResult';
}

function isCopyTableCellsMessage(message: object): message is CopyTableCellsMessage {
	return 'command' in message && message.command === 'copyTableCells'
		&& 'text' in message && typeof message.text === 'string';
}

function isTableSelectionDebugMessage(message: object): message is TableSelectionDebugMessage {
	return 'command' in message && message.command === 'tableSelectionDebug'
		&& 'message' in message && typeof message.message === 'string';
}
