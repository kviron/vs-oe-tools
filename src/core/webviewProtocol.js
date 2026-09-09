"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductionTasksWebviewMessage = isProductionTasksWebviewMessage;
exports.isProductionTaskDetailsWebviewMessage = isProductionTaskDetailsWebviewMessage;
exports.isSettingsWebviewMessage = isSettingsWebviewMessage;
exports.isPackageSyncWebviewMessage = isPackageSyncWebviewMessage;
exports.isCodeHistoryWebviewMessage = isCodeHistoryWebviewMessage;
exports.isClassDetailsWebviewMessage = isClassDetailsWebviewMessage;
exports.isAttributeDetailsWebviewMessage = isAttributeDetailsWebviewMessage;
exports.isPropertyDetailsWebviewMessage = isPropertyDetailsWebviewMessage;
exports.isClassObjectsWebviewMessage = isClassObjectsWebviewMessage;
exports.isSpuEditorWebviewMessage = isSpuEditorWebviewMessage;
exports.isObjectViewWebviewMessage = isObjectViewWebviewMessage;
exports.isPackageContentWebviewMessage = isPackageContentWebviewMessage;
exports.isExplorerWebviewMessage = isExplorerWebviewMessage;
exports.isCopyEntityIdMessage = isCopyEntityIdMessage;
exports.isOpenClientEntityMessage = isOpenClientEntityMessage;
exports.isSqlMonitorWebviewMessage = isSqlMonitorWebviewMessage;
exports.isSqlExecutorWebviewMessage = isSqlExecutorWebviewMessage;
function isProductionTasksWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'productionTasksReady' || message.command === 'refreshProductionTasks' || message.command === 'importProductionSessionKey'
        || message.command === 'setProductionTasksPassword'
        || message.command === 'openProductionTasksLog'
        || (message.command === 'copyTableCells' && 'text' in message && typeof message.text === 'string')
        || (message.command === 'tableSelectionDebug' && 'message' in message && typeof message.message === 'string')
        || ((message.command === 'openProductionTask' || message.command === 'openProductionTaskInClient')
            && 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0);
}
function isProductionTaskDetailsWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'openDatabaseObjectById') {
        return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0
            && (!('target' in message) || message.target === 'explorer' || message.target === 'object');
    }
    if (message.command === 'productionTaskAttachmentAction') {
        return 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0
            && 'action' in message && (message.action === 'open' || message.action === 'preview' || message.action === 'save' || message.action === 'reveal');
    }
    if (message.command === 'openExternalUrl') {
        return 'url' in message && typeof message.url === 'string' && /^https?:\/\//i.test(message.url);
    }
    return message.command === 'productionTaskDetailsReady'
        || message.command === 'loadProductionTaskAttachments'
        || message.command === 'loadProductionTaskHistory'
        || (message.command === 'copyTableCells' && 'text' in message && typeof message.text === 'string')
        || (message.command === 'tableSelectionDebug' && 'message' in message && typeof message.message === 'string')
        || ((message.command === 'openProductionTaskInClient' || message.command === 'openProductionTaskReference' || message.command === 'loadProductionTaskPreview' || message.command === 'loadDatabaseObjectPreview')
            && 'id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id) && message.id > 0);
}
function isSettingsWebviewMessage(message) {
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
    if (message.command === 'setDatabaseProfile') {
        return 'profile' in message && typeof message.profile === 'string';
    }
    if (message.command === 'saveDatabaseProfile') {
        return 'profile' in message && typeof message.profile === 'string'
            && 'fields' in message && Array.isArray(message.fields)
            && message.fields.every(field => typeof field === 'object' && field !== null && 'key' in field && typeof field.key === 'string' && 'value' in field && typeof field.value === 'string');
    }
    if (message.command === 'runProjectCommand') {
        if (!('action' in message)) {
            return false;
        }
        if (message.action === 'updatePackages' || message.action === 'updateBinaries') {
            return true;
        }
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
    return message.command === 'copyMcpConnectionCode' && 'text' in message && typeof message.text === 'string';
}
function isPackageSyncWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'packageSyncReady'
        || message.command === 'refreshPackageSync'
        || (message.command === 'openPackageSyncDiff' && 'objectId' in message && typeof message.objectId === 'number');
}
function isCodeHistoryWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'codeHistoryReady'
        || (message.command === 'openCodeHistoryEntry' && 'id' in message && typeof message.id === 'string');
}
function isClassDetailsWebviewMessage(message) {
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
function isAttributeDetailsWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'attributeDetailsReady') {
        return true;
    }
    return message.command === 'createClassAttribute' && 'draft' in message && typeof message.draft === 'object' && message.draft !== null;
}
function isPropertyDetailsWebviewMessage(message) {
    return typeof message === 'object' && message !== null && 'command' in message && message.command === 'propertyDetailsReady';
}
function isClassObjectsWebviewMessage(message) {
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
        if (!('settings' in message) || typeof message.settings !== 'object' || message.settings === null) {
            return false;
        }
        const settings = message.settings;
        return 'visible' in settings && Array.isArray(settings.visible) && settings.visible.every(value => typeof value === 'string')
            && 'order' in settings && Array.isArray(settings.order) && settings.order.every(value => typeof value === 'string')
            && 'compact' in settings && typeof settings.compact === 'boolean';
    }
    return message.command === 'classObjectsReady' || message.command === 'refreshClassObjects'
        || isCopyTableCellsMessage(message) || isCopyEntityIdMessage(message) || isOpenClientEntityMessage(message);
}
function isSpuEditorWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'spuEditorReady') {
        return true;
    }
    if (message.command !== 'saveSpu' || !('draft' in message) || typeof message.draft !== 'object' || message.draft === null) {
        return false;
    }
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
function isObjectViewWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'objectViewReady'
        || message.command === 'refreshObjectView'
        || message.command === 'copyObjectJson'
        || isCopyTableCellsMessage(message)
        || isTableSelectionDebugMessage(message);
}
function isPackageContentWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'packageContentReady'
        || message.command === 'refreshPackageContent'
        || isCopyTableCellsMessage(message)
        || isTableSelectionDebugMessage(message)
        || (message.command === 'openPackageContentObject' && 'id' in message && typeof message.id === 'number'
            && 'kind' in message && ['class', 'method', 'attribute', 'lifecycle', 'journal', 'list', 'object'].includes(String(message.kind)));
}
function isExplorerWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'loadClasses') {
        return true;
    }
    if (message.command === 'loadPackages') {
        return true;
    }
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
            && 'kind' in message && (message.kind === 'class' || message.kind === 'method' || message.kind === 'attribute' || message.kind === 'lifecycle' || message.kind === 'journal' || message.kind === 'list' || message.kind === 'object');
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
function isCopyEntityIdMessage(message) {
    return typeof message === 'object'
        && message !== null
        && 'command' in message
        && message.command === 'copyEntityId'
        && 'id' in message
        && (typeof message.id === 'number' || typeof message.id === 'string');
}
function isOpenClientEntityMessage(message) {
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
function isSqlMonitorWebviewMessage(message) {
    return typeof message === 'object'
        && message !== null
        && 'command' in message
        && (message.command === 'sqlMonitorReady'
            || message.command === 'clearSqlMonitor'
            || (message.command === 'setSqlMonitorPaused' && 'paused' in message && typeof message.paused === 'boolean')
            || isTableSelectionDebugMessage(message)
            || isCopyTableCellsMessage(message));
}
function isSqlExecutorWebviewMessage(message) {
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
function isCopyTableCellsMessage(message) {
    return 'command' in message && message.command === 'copyTableCells'
        && 'text' in message && typeof message.text === 'string';
}
function isTableSelectionDebugMessage(message) {
    return 'command' in message && message.command === 'tableSelectionDebug'
        && 'message' in message && typeof message.message === 'string';
}
//# sourceMappingURL=webviewProtocol.js.map