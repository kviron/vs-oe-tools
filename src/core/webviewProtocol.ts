import type { AttributeDetails, AttributeEditorOptions, ClassAttribute, ClassDetails, ClassMethod, ClassObjectColumnSettings, ClassObjectsResult, ClassProperty, ClassTreeRow, MethodPropertiesDetails, ObjectViewResult, PropertyDetails } from '../features/classes/models';
import { validateNativeAttributeDraft, type NativeAttributeDraft } from '../features/classes/nativeAttributeEditing';
import type { PackageSyncIssue, PackageSyncItem, SvnConflictContent, SvnMergeResult } from '../features/package-sync/models';
import type { DatabaseObjectKind, DatabaseObjectSearchResult } from './objectSearch';
import type { ProductionTaskAction, ProductionTaskAttachment, ProductionTaskDescriptionPart, ProductionTaskHistoryEntry, ProductionTaskListItem, ProductionTaskSummary, ProductionTaskUser } from '../features/production-tasks/models';
import type { CreatedSpu, SpuDraft, SpuEditorOptions } from '../features/spu/models';
import type { SqlCompletionSchema } from '../features/sql-executor/sqlCompletionSchema';
import type { PackageExplorerNode, PackageFileContent, PackageSummary } from '../features/packages/models';
import { isCopyEntityIdMessage, isCopyTableCellsMessage, isOpenClientEntityMessage, isTableSelectionDebugMessage, type CopyEntityIdMessage, type CopyTableCellsMessage, type OpenClientEntityMessage, type TableSelectionDebugMessage } from './webview/commonMessages';
import { type SqlExecutorWebviewMessage, type SqlMonitorWebviewMessage } from './webview/sqlMessages';

export type { CopyEntityIdMessage, CopyTableCellsMessage, OpenClientEntityMessage, TableSelectionDebugMessage } from './webview/commonMessages';
export { isCopyEntityIdMessage, isOpenClientEntityMessage } from './webview/commonMessages';
export type { SqlExecutorHostMessage, SqlExecutorWebviewMessage, SqlHistoryEntry, SqlMonitorHostMessage, SqlMonitorWebviewMessage } from './webview/sqlMessages';
export { isSqlExecutorWebviewMessage, isSqlMonitorWebviewMessage } from './webview/sqlMessages';

export interface NativeLogListEntry {
	name: string;
	size: number;
	modifiedAt: string;
}
export type NativeLogsWebviewMessage =
	| { command: 'nativeLogsReady' }
	| { command: 'refreshNativeLogs' }
	| { command: 'openNativeLog'; fileName: string }
	| { command: 'copyNativeLog'; text: string };
export type NativeLogsHostMessage =
	| { command: 'nativeLogsLoading' }
	| { command: 'nativeLogsLoaded'; directory: string; files: NativeLogListEntry[]; selectedFile?: string; content?: string; contentTruncated?: boolean }
	| { command: 'nativeLogsFailed'; message: string };

export type ProductionTasksWebviewMessage =
	| { command: 'productionTasksReady'; userFilter?: string }
	| { command: 'refreshProductionTasks'; userFilter?: string }
	| { command: 'importProductionSessionKey' }
	| { command: 'setProductionTasksPassword' }
	| { command: 'openProductionTasksLog' }
	| { command: 'openProductionTask'; id: number }
	| { command: 'openProductionTaskInClient'; id: number }
	| CopyTableCellsMessage
	| TableSelectionDebugMessage;
export type ProductionTasksHostMessage =
	| { command: 'productionTasksLoading' }
	| { command: 'productionTaskUsersLoaded'; users: ProductionTaskUser[] }
	| { command: 'productionTasksLoaded'; tasks: ProductionTaskListItem[]; loadedAt: string; currentPersonId: number; users: ProductionTaskUser[]; userFilter: string }
	| { command: 'productionTasksFailed'; message: string };
export type ProductionTaskDetailsWebviewMessage =
	| { command: 'productionTaskDetailsReady' }
	| { command: 'loadProductionTaskAttachments' }
	| { command: 'loadProductionTaskActions' }
	| { command: 'openProductionTaskInClient'; id: number }
	| { command: 'openProductionTaskReference'; id: number }
	| { command: 'loadProductionTaskPreview'; id: number }
	| { command: 'openDatabaseObjectById'; id: number; target?: 'explorer' | 'object' }
	| { command: 'loadDatabaseObjectPreview'; id: number }
	| { command: 'loadProductionTaskHistory' }
	| { command: 'productionTaskAttachmentAction'; id: number; action: 'open' | 'preview' | 'save' | 'reveal' }
	| { command: 'openExternalUrl'; url: string }
	| CopyTableCellsMessage
	| TableSelectionDebugMessage;
export type ProductionTaskDetailsHostMessage =
	| { command: 'productionTaskDetailsLoaded'; task: ProductionTaskSummary }
	| { command: 'productionTaskRichDescriptionLoading' }
	| { command: 'productionTaskRichDescriptionLoaded'; parts: ProductionTaskDescriptionPart[] }
	| { command: 'productionTaskRichDescriptionFailed'; message: string }
	| { command: 'productionTaskActionsLoading' }
	| { command: 'productionTaskActionsLoaded'; actions: ProductionTaskAction[] }
	| { command: 'productionTaskActionsFailed'; message: string }
	| { command: 'productionTaskAttachmentsLoading' }
	| { command: 'productionTaskAttachmentsLoaded'; attachments: ProductionTaskAttachment[] }
	| { command: 'productionTaskAttachmentsFailed'; message: string }
	| { command: 'productionTaskHistoryLoading' }
	| { command: 'productionTaskHistoryLoaded'; history: ProductionTaskHistoryEntry[] }
	| { command: 'productionTaskHistoryFailed'; message: string }
	| { command: 'databaseObjectPreviewLoaded'; id: number; object?: DatabaseObjectSearchResult }
	| { command: 'databaseObjectPreviewFailed'; id: number; message: string }
	| { command: 'productionTaskPreviewLoaded'; id: number; task?: ProductionTaskSummary }
	| { command: 'productionTaskPreviewFailed'; id: number; message: string };

export type ExplorerWebviewMessage =
	| { command: 'explorerReady' }
	| { command: 'explorerStateChanged'; activeTab: string; selectedClassId?: number; selectedPackageId?: number }
	| { command: 'loadPackages' }
	| { command: 'loadPackageTree'; packageId: number }
	| { command: 'loadPackageFileObjects'; fileId: number }
	| { command: 'openPackageContent'; fileId: number; objectId?: number }
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
	| { command: 'restoreExplorerState'; activeTab: string; selectedClassId?: number; selectedPackageId?: number }
	| { command: 'packagesLoaded'; packages: PackageSummary[] }
	| { command: 'packagesLoadFailed'; message: string }
	| { command: 'packageTreeLoading'; packageId: number }
	| { command: 'packageTreeLoaded'; packageId: number; tree: PackageExplorerNode }
	| { command: 'packageTreeLoadFailed'; packageId: number; message: string }
	| { command: 'packageFileObjectsLoaded'; fileId: number; objects: PackageFileContent['objects'] }
	| { command: 'packageFileObjectsLoadFailed'; fileId: number; message: string }
	| { command: 'classesLoaded'; classes: ClassTreeRow[] }
	| { command: 'classesLoadFailed'; message: string }
	| { command: 'revealClass'; id: number }
	| { command: 'revealPackage'; id: number }
	| { command: 'resetClasses' }
	| { command: 'resetPackages' }
	| { command: 'databaseObjectsLoading'; query: string }
	| { command: 'databaseObjectsLoaded'; query: string; objects: DatabaseObjectSearchResult[] }
	| { command: 'databaseObjectsLoadFailed'; query: string; message: string };

export type ClassDetailsWebviewMessage =
	| { command: 'classDetailsReady' }
	| { command: 'classDetailsStateChanged'; activeTab: string }
	| { command: 'loadClassAttributes'; includeInherited: boolean }
	| { command: 'loadClassMethods'; includeInherited: boolean }
	| { command: 'loadClassProperties'; includeInherited: boolean }
	| { command: 'createAttribute'; classId: number }
	| { command: 'createMethod'; classId: number }
	| { command: 'openMethod'; id: number }
	| { command: 'openAttribute'; id: number }
	| { command: 'editAttribute'; id: number }
	| { command: 'openProperty'; id: number }
	| { command: 'openClassObjects'; classId: number }
	| { command: 'viewObject'; id: number }
	| { command: 'viewEntityProperties'; id: number }
	| { command: 'methodSvnAction'; id: number; action: 'localDiff' | 'history' | 'blame' }
	| CopyTableCellsMessage
	| CopyEntityIdMessage
	| OpenClientEntityMessage
	| TableSelectionDebugMessage;

export type ClassDetailsHostMessage =
	| { command: 'classDetailsLoaded'; details: ClassDetails; activeTab?: string }
	| { command: 'revealClassMethod'; methodId: number }
	| { command: 'classAttributesLoaded'; attributes: ClassAttribute[]; includeInherited: boolean }
	| { command: 'classAttributesLoadFailed'; message: string; includeInherited: boolean }
	| { command: 'classMethodsLoaded'; methods: ClassMethod[]; includeInherited: boolean }
	| { command: 'classMethodsLoadFailed'; message: string; includeInherited: boolean }
	| { command: 'classPropertiesLoaded'; properties: ClassProperty[]; includeInherited: boolean }
	| { command: 'classPropertiesLoadFailed'; message: string; includeInherited: boolean };
export type AttributeDetailsWebviewMessage =
	| { command: 'attributeDetailsReady' | 'attributeRefresh' | 'attributeEdit' | 'attributeCancel' | 'attributeNew' | 'attributeCopyId' | 'attributeOpenOwner' }
	| { command: 'attributeSave'; draft: NativeAttributeDraft };
export type AttributeDetailsHostMessage =
	{ command: 'attributeEditorState'; details?: AttributeDetails; options: AttributeEditorOptions;
		draft: NativeAttributeDraft; mode: 'view' | 'edit' | 'create'; busy: boolean;
		error?: string; warning?: string; blocked?: boolean };
export type PropertyDetailsWebviewMessage = { command: 'propertyDetailsReady' };
export type PropertyDetailsHostMessage = { command: 'propertyDetailsLoaded'; details: PropertyDetails };
export type EntityPropertiesWebviewMessage =
	{ command: 'entityPropertiesReady' | 'entityPropertiesRefresh' | 'methodPropertiesCopyId' | 'methodPropertiesOpenOwner' | 'methodPropertiesOpenCode' };
export type EntityPropertiesHostMessage = { command: 'entityPropertiesLoaded'; result: ObjectViewResult;
	attributes?: Record<string, unknown>; method?: MethodPropertiesDetails; busy?: boolean; error?: string };
export type ClassObjectsWebviewMessage =
	| { command: 'classObjectsReady' }
	| { command: 'refreshClassObjects' }
	| { command: 'loadMoreClassObjects'; offset: number }
	| { command: 'saveClassObjectColumnSettings'; settings: ClassObjectColumnSettings }
	| { command: 'createSpu'; preferredPackageName?: string }
	| { command: 'viewObject'; id: number }
	| { command: 'viewEntityProperties'; id: number }
	| CopyTableCellsMessage
	| CopyEntityIdMessage
	| OpenClientEntityMessage;
export type ClassObjectsHostMessage =
	| { command: 'classObjectsLoading'; append: boolean }
	| { command: 'classObjectsLoaded'; result: ClassObjectsResult; append: boolean; columnSettings?: ClassObjectColumnSettings }
	| { command: 'revealClassObject'; objectId: number }
	| { command: 'classObjectsLoadFailed'; message: string };
export type SpuEditorWebviewMessage =
	| { command: 'spuEditorReady' }
	| { command: 'saveSpu'; draft: SpuDraft };
export type SpuEditorHostMessage =
	| { command: 'spuEditorInitialized'; options: SpuEditorOptions }
	| { command: 'sqlCompletionSchemaLoaded'; completion: SqlCompletionSchema }
	| { command: 'spuSaving' }
	| { command: 'spuSaved'; saved: CreatedSpu }
	| { command: 'spuSaveFailed'; message: string };
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
export type PackageContentWebviewMessage =
	| { command: 'packageContentReady' }
	| { command: 'refreshPackageContent' }
	| { command: 'openPackageContentObject'; id: number; kind: DatabaseObjectKind }
	| CopyTableCellsMessage
	| TableSelectionDebugMessage;
export type PackageContentHostMessage =
	| { command: 'packageContentLoading' }
	| { command: 'packageContentLoaded'; result: PackageFileContent; selectedObjectId?: number }
	| { command: 'revealPackageContentObject'; objectId: number }
	| { command: 'packageContentLoadFailed'; message: string };
export type PackageSyncWebviewMessage =
	| { command: 'packageSyncReady' }
	| { command: 'refreshPackageSync' }
	| { command: 'openPackageSyncDiff'; objectId: number }
	| { command: 'mergeSvnRevision'; branch: string; revision: number }
	| { command: 'openSvnConflict'; path: string };
export type PackageSyncHostMessage =
	| { command: 'packageSyncLoading' }
	| { command: 'packageSyncLoaded'; items: PackageSyncItem[]; issues: PackageSyncIssue[] }
	| { command: 'packageSyncFailed'; message: string }
	| { command: 'svnMergeStarted' }
	| { command: 'svnMergeCancelled' }
	| { command: 'svnMergeCompleted'; result: SvnMergeResult }
	| { command: 'svnMergeFailed'; message: string };
export type SvnConflictWebviewMessage =
	| { command: 'svnConflictReady' }
	| { command: 'saveSvnConflict'; content: string; resolve: boolean };
export type SvnConflictHostMessage =
	| { command: 'svnConflictLoaded'; conflict: SvnConflictContent }
	| { command: 'svnConflictSaving' }
	| { command: 'svnConflictSaved'; resolved: boolean }
	| { command: 'svnConflictFailed'; message: string };
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
	clientLaunchArguments: string;
	mcpEnabled: boolean;
	mcpStatus: 'ready' | 'disabled' | 'unavailable';
	mcpStatusText: string;
	clientMcpUrl: string;
	clientMcpStatus: 'online' | 'offline';
	clientMcpStatusText: string;
	clientMcpDatabase?: string;
	clientMcpDatabaseMatchesSelection?: boolean;
	extensionMcpTools: Array<{ name: string; description: string; deprecated: boolean }>;
	clientMcpTools?: Array<{ name: string; description: string }>;
	clientMcpToolsDatabase?: string;
	clientMcpToolsUpdatedAt?: string;
	clientMcpToolsError?: string;
	mcpConnectionCode: string;
	lastExtensionError?: { timestamp: string; source: string; message: string };
	httpMethods: Array<{ id: number; name: string; methodId: number; signature: string; description: string }>;
	httpMethodsError?: string;
	httpTestServer?: { methodName: string; database: string; url: string; processId?: number };
}
export type SettingsWebviewMessage =
	| { command: 'settingsReady' }
	| { command: 'setProjectRootEnabled'; enabled: boolean }
	| { command: 'setDatabaseRole'; role: 'main' | 'test' }
	| { command: 'setDatabaseProfile'; profile: string }
	| { command: 'saveDatabaseProfile'; profile: string; fields: Array<{ key: string; value: string }> }
	| { command: 'runProjectCommand'; action: 'updateDatabase' | 'startClient'; role: 'main' | 'test' }
	| { command: 'runProjectCommand'; action: 'updatePackages' | 'updateBinaries' }
	| { command: 'setUserId'; userId: number }
	| { command: 'setClientCredentials'; username: string; password?: string }
	| { command: 'setClientLaunchArguments'; value: string }
	| { command: 'setMcpEnabled'; enabled: boolean }
	| { command: 'refreshClientMcpStatus' }
	| { command: 'checkClientMcpTools' }
	| { command: 'startClientMcpServer' }
	| { command: 'stopClientMcpServer' }
	| { command: 'executeHttpApiRequest'; method: string; url: string; headers: Record<string, string>; body?: string }
	| { command: 'executeDirectHttpMethod'; methodName: string; parameters: Record<string, string> }
	| { command: 'startHttpTestServer'; methodName: string }
	| { command: 'stopHttpTestServer' }
	| { command: 'searchHttpParameterValues'; parameter: string; typeName: string; query: string }
	| { command: 'copyHttpApiRequest'; text: string; notification?: string }
	| { command: 'saveHttpApiResponse'; text: string; fileName: string; contentType?: string }
	| { command: 'openDatabaseObjectById'; id: number; target?: 'explorer' | 'object' }
	| { command: 'testSettingsDatabaseConnection' }
	| { command: 'copyMcpConnectionCode'; text: string }
	| { command: 'clearExtensionLogs' };
export type SettingsHostMessage =
	| { command: 'settingsState'; state: SettingsState }
	| { command: 'databaseConnectionTestStarted' }
	| { command: 'databaseConnectionTestFinished'; success: boolean; message: string }
	| { command: 'clientMcpActionStarted'; action: 'start' | 'stop' }
	| { command: 'clientMcpActionFinished'; action: 'start' | 'stop'; success: boolean; message: string }
	| { command: 'clientMcpToolsCheckStarted' }
	| { command: 'clientMcpToolsCheckFinished'; success: boolean }
	| { command: 'httpApiRequestStarted' }
	| { command: 'httpApiRequestFinished'; success: true; response: { execution?: 'direct'; status: number; statusText: string; durationMs: number; headers: Record<string, string>; cookies: string[]; body: string; bodySizeBytes: number; contentType: string; url: string; redirected: boolean } }
	| { command: 'httpApiRequestFinished'; success: false; message: string }
	| { command: 'httpTestServerActionStarted'; action: 'start' | 'stop' }
	| { command: 'httpTestServerActionFinished'; action: 'start' | 'stop'; success: boolean; message: string }
	| { command: 'httpParameterValuesLoaded'; parameter: string; query: string; values: Array<{ id: number; name: string }> };
export type WebviewMessage = ExplorerWebviewMessage | ClassDetailsWebviewMessage | AttributeDetailsWebviewMessage | PropertyDetailsWebviewMessage | EntityPropertiesWebviewMessage | ClassObjectsWebviewMessage | SpuEditorWebviewMessage | ObjectViewWebviewMessage | PackageContentWebviewMessage | SqlMonitorWebviewMessage | SqlExecutorWebviewMessage | NativeLogsWebviewMessage | CodeHistoryWebviewMessage | PackageSyncWebviewMessage | SvnConflictWebviewMessage | SettingsWebviewMessage | ProductionTasksWebviewMessage | ProductionTaskDetailsWebviewMessage;

export function isNativeLogsWebviewMessage(message: unknown): message is NativeLogsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	if (message.command === 'nativeLogsReady' || message.command === 'refreshNativeLogs') { return true; }
	if (message.command === 'openNativeLog') { return 'fileName' in message && typeof message.fileName === 'string'; }
	return message.command === 'copyNativeLog' && 'text' in message && typeof message.text === 'string';
}

export function isProductionTasksWebviewMessage(message: unknown): message is ProductionTasksWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	if (message.command === 'productionTasksReady' || message.command === 'refreshProductionTasks') {
		return !('userFilter' in message) || message.userFilter === undefined
			|| (typeof message.userFilter === 'string' && message.userFilter.length <= 1000);
	}
	return message.command === 'importProductionSessionKey'
		|| message.command === 'setProductionTasksPassword'
		|| message.command === 'openProductionTasksLog'
		|| (message.command === 'copyTableCells' && 'text' in message && typeof message.text === 'string')
		|| (message.command === 'tableSelectionDebug' && 'message' in message && typeof message.message === 'string')
		|| ((message.command === 'openProductionTask' || message.command === 'openProductionTaskInClient')
			&& 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0);
}

export function isProductionTaskDetailsWebviewMessage(message: unknown): message is ProductionTaskDetailsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	if (message.command === 'openDatabaseObjectById') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0
			&& (!('target' in message) || message.target === 'explorer' || message.target === 'object');
	}
	if (message.command === 'productionTaskAttachmentAction') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0
			&& 'action' in message && (message.action === 'open' || message.action === 'preview' || message.action === 'save' || message.action === 'reveal');
	}
	if (message.command === 'openExternalUrl') { return 'url' in message && typeof message.url === 'string' && /^https?:\/\//i.test(message.url); }
	return message.command === 'productionTaskDetailsReady'
		|| message.command === 'loadProductionTaskAttachments'
		|| message.command === 'loadProductionTaskActions'
		|| message.command === 'loadProductionTaskHistory'
		|| (message.command === 'copyTableCells' && 'text' in message && typeof message.text === 'string')
		|| (message.command === 'tableSelectionDebug' && 'message' in message && typeof message.message === 'string')
		|| ((message.command === 'openProductionTaskInClient' || message.command === 'openProductionTaskReference' || message.command === 'loadProductionTaskPreview' || message.command === 'loadDatabaseObjectPreview')
			&& 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0);
}

export function isSettingsWebviewMessage(message: unknown): message is SettingsWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'settingsReady' || message.command === 'testSettingsDatabaseConnection' || message.command === 'refreshClientMcpStatus' || message.command === 'checkClientMcpTools' || message.command === 'startClientMcpServer' || message.command === 'stopClientMcpServer' || message.command === 'stopHttpTestServer' || message.command === 'clearExtensionLogs') {
		return true;
	}
	if (message.command === 'openDatabaseObjectById') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0
			&& (!('target' in message) || message.target === 'explorer' || message.target === 'object');
	}
	if (message.command === 'executeHttpApiRequest') {
		return 'method' in message && typeof message.method === 'string'
			&& 'url' in message && typeof message.url === 'string'
			&& 'headers' in message && typeof message.headers === 'object' && message.headers !== null
			&& Object.entries(message.headers).every(([key, value]) => key.length > 0 && typeof value === 'string')
			&& (!('body' in message) || message.body === undefined || typeof message.body === 'string');
	}
	if (message.command === 'executeDirectHttpMethod') {
		return 'methodName' in message && typeof message.methodName === 'string' && message.methodName.trim().length > 0
			&& message.methodName.trim() !== '*' && !/[,;="\r\n]/u.test(message.methodName)
			&& 'parameters' in message && typeof message.parameters === 'object' && message.parameters !== null
			&& !Array.isArray(message.parameters)
			&& Object.entries(message.parameters).every(([key, value]) => key.length > 0 && typeof value === 'string');
	}
	if (message.command === 'startHttpTestServer') { return 'methodName' in message && typeof message.methodName === 'string' && message.methodName.trim().length > 0; }
	if (message.command === 'searchHttpParameterValues') {
		return 'parameter' in message && typeof message.parameter === 'string'
			&& 'typeName' in message && typeof message.typeName === 'string'
			&& 'query' in message && typeof message.query === 'string';
	}
	if (message.command === 'copyHttpApiRequest') {
		return 'text' in message && typeof message.text === 'string' && message.text.length > 0
			&& (!('notification' in message) || message.notification === undefined || typeof message.notification === 'string');
	}
	if (message.command === 'saveHttpApiResponse') {
		return 'text' in message && typeof message.text === 'string' && message.text.length <= 16 * 1024 * 1024
			&& 'fileName' in message && typeof message.fileName === 'string' && /^[^\\/:*?"<>|\r\n]{1,200}$/u.test(message.fileName)
			&& (!('contentType' in message) || message.contentType === undefined || typeof message.contentType === 'string');
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
		if (!('action' in message)) { return false; }
		if (message.action === 'updatePackages' || message.action === 'updateBinaries') { return true; }
		return (message.action === 'updateDatabase' || message.action === 'startClient')
			&& 'role' in message && (message.role === 'main' || message.role === 'test');
	}
	if (message.command === 'setUserId') {
		return 'userId' in message && typeof message.userId === 'number' && Number.isInteger(message.userId) && message.userId >= 0;
	}
	if (message.command === 'setClientCredentials') {
		return 'username' in message && typeof message.username === 'string'
			&& (!('password' in message) || message.password === undefined || typeof message.password === 'string');
	}
	if (message.command === 'setClientLaunchArguments') {
		return 'value' in message && typeof message.value === 'string' && message.value.length <= 2000;
	}
	return message.command === 'copyMcpConnectionCode' && 'text' in message && typeof message.text === 'string';
}

export function isPackageSyncWebviewMessage(message: unknown): message is PackageSyncWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {return false;}
	return message.command === 'packageSyncReady'
		|| message.command === 'refreshPackageSync'
		|| (message.command === 'openPackageSyncDiff' && 'objectId' in message && typeof message.objectId === 'number')
		|| (message.command === 'openSvnConflict' && 'path' in message && typeof message.path === 'string')
		|| (message.command === 'mergeSvnRevision' && 'branch' in message && typeof message.branch === 'string'
			&& 'revision' in message && typeof message.revision === 'number' && Number.isSafeInteger(message.revision) && message.revision > 0);
}

export function isSvnConflictWebviewMessage(message: unknown): message is SvnConflictWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	return message.command === 'svnConflictReady'
		|| (message.command === 'saveSvnConflict' && 'content' in message && typeof message.content === 'string'
			&& 'resolve' in message && typeof message.resolve === 'boolean');
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
	| { command: 'openCodeHistoryEntry'; id: string }
	| { command: 'openCodeHistoryTask'; id: number }
	| CopyTableCellsMessage
	| TableSelectionDebugMessage;

export type CodeHistoryHostMessage =
	| { command: 'codeHistoryLoading'; title: string }
	| { command: 'codeHistoryLoaded'; title: string; subtitle: string; entries: CodeHistoryListEntry[] }
	| { command: 'codeHistoryFailed'; title: string; message: string };

export function isCodeHistoryWebviewMessage(message: unknown): message is CodeHistoryWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	return message.command === 'codeHistoryReady'
		|| isCopyTableCellsMessage(message)
		|| isTableSelectionDebugMessage(message)
		|| (message.command === 'openCodeHistoryEntry' && 'id' in message && typeof message.id === 'string')
		|| (message.command === 'openCodeHistoryTask' && 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0);
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
	if (message.command === 'createAttribute' || message.command === 'createMethod') {
		return 'classId' in message && typeof message.classId === 'number' && Number.isSafeInteger(message.classId) && message.classId > 0;
	}
	if (message.command === 'openMethod' || message.command === 'openAttribute' || message.command === 'editAttribute' || message.command === 'openProperty') {
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
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	if (['attributeDetailsReady', 'attributeRefresh', 'attributeEdit', 'attributeCancel', 'attributeNew', 'attributeCopyId', 'attributeOpenOwner'].includes(String(message.command))) { return true; }
	if (message.command !== 'attributeSave' || !('draft' in message)) { return false; }
	try { validateNativeAttributeDraft(message.draft); return true; } catch { return false; }
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
	if (message.command === 'createSpu') {
		return !('preferredPackageName' in message) || message.preferredPackageName === undefined || typeof message.preferredPackageName === 'string';
	}
	if (message.command === 'saveClassObjectColumnSettings') {
		if (!('settings' in message) || typeof message.settings !== 'object' || message.settings === null) { return false; }
		const settings = message.settings;
		return 'visible' in settings && Array.isArray(settings.visible) && settings.visible.every(value => typeof value === 'string')
			&& 'order' in settings && Array.isArray(settings.order) && settings.order.every(value => typeof value === 'string')
			&& 'compact' in settings && typeof settings.compact === 'boolean';
	}
	return message.command === 'classObjectsReady' || message.command === 'refreshClassObjects'
		|| isCopyTableCellsMessage(message) || isCopyEntityIdMessage(message) || isOpenClientEntityMessage(message);
}

export function isSpuEditorWebviewMessage(message: unknown): message is SpuEditorWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	if (message.command === 'spuEditorReady') { return true; }
	if (message.command !== 'saveSpu' || !('draft' in message) || typeof message.draft !== 'object' || message.draft === null) { return false; }
	const draft = message.draft;
	return 'name' in draft && typeof draft.name === 'string'
		&& 'packageId' in draft && typeof draft.packageId === 'number' && Number.isSafeInteger(draft.packageId)
		&& 'typeId' in draft && typeof draft.typeId === 'number' && Number.isSafeInteger(draft.typeId)
		&& 'executionOrder' in draft && typeof draft.executionOrder === 'string'
		&& 'versionControl' in draft && typeof draft.versionControl === 'boolean'
		&& 'beginVersion' in draft && typeof draft.beginVersion === 'number' && Number.isSafeInteger(draft.beginVersion)
		&& 'isAfterUpdate' in draft && typeof draft.isAfterUpdate === 'boolean'
		&& 'executeAlways' in draft && typeof draft.executeAlways === 'boolean'
		&& 'sqlScript' in draft && typeof draft.sqlScript === 'string'
		&& 'comment' in draft && typeof draft.comment === 'string';
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

export function isPackageContentWebviewMessage(message: unknown): message is PackageContentWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) { return false; }
	return message.command === 'packageContentReady'
		|| message.command === 'refreshPackageContent'
		|| isCopyTableCellsMessage(message)
		|| isTableSelectionDebugMessage(message)
		|| (message.command === 'openPackageContentObject' && 'id' in message && typeof message.id === 'number'
			&& 'kind' in message && ['class', 'method', 'module', 'attribute', 'lifecycle', 'journal', 'list', 'object'].includes(String(message.kind)));
}

export function isExplorerWebviewMessage(message: unknown): message is ExplorerWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'loadClasses') {
		return true;
	}
	if (message.command === 'loadPackages') { return true; }
	if (message.command === 'loadPackageTree') {
		return 'packageId' in message && typeof message.packageId === 'number' && Number.isSafeInteger(message.packageId);
	}
	if (message.command === 'loadPackageFileObjects' || message.command === 'openPackageContent') {
		return 'fileId' in message && typeof message.fileId === 'number' && Number.isSafeInteger(message.fileId)
			&& (message.command !== 'openPackageContent' || !('objectId' in message) || message.objectId === undefined || (typeof message.objectId === 'number' && Number.isSafeInteger(message.objectId)));
	}
	if (message.command === 'searchDatabaseObjects') {
		return 'query' in message && typeof message.query === 'string';
	}
	if (message.command === 'openDatabaseObject') {
		return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id)
			&& 'pinned' in message && typeof message.pinned === 'boolean'
			&& 'kind' in message && (message.kind === 'class' || message.kind === 'method' || message.kind === 'module' || message.kind === 'attribute' || message.kind === 'lifecycle' || message.kind === 'journal' || message.kind === 'list' || message.kind === 'object');
	}
	if (message.command === 'explorerReady') {
		return true;
	}
	if (message.command === 'explorerStateChanged') {
		return 'activeTab' in message && typeof message.activeTab === 'string'
			&& (!('selectedClassId' in message) || message.selectedClassId === undefined || typeof message.selectedClassId === 'number')
			&& (!('selectedPackageId' in message) || message.selectedPackageId === undefined || typeof message.selectedPackageId === 'number');
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
