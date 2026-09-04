"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSettingsWebviewMessage = isSettingsWebviewMessage;
exports.isPackageSyncWebviewMessage = isPackageSyncWebviewMessage;
exports.isCodeHistoryWebviewMessage = isCodeHistoryWebviewMessage;
exports.isClassDetailsWebviewMessage = isClassDetailsWebviewMessage;
exports.isAttributeDetailsWebviewMessage = isAttributeDetailsWebviewMessage;
exports.isPropertyDetailsWebviewMessage = isPropertyDetailsWebviewMessage;
exports.isClassObjectsWebviewMessage = isClassObjectsWebviewMessage;
exports.isObjectViewWebviewMessage = isObjectViewWebviewMessage;
exports.isExplorerWebviewMessage = isExplorerWebviewMessage;
exports.isCopyEntityIdMessage = isCopyEntityIdMessage;
exports.isSqlMonitorWebviewMessage = isSqlMonitorWebviewMessage;
exports.isSqlExecutorWebviewMessage = isSqlExecutorWebviewMessage;
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
    return (message.command === 'loadClassMethods' || message.command === 'loadClassProperties')
        && 'includeInherited' in message
        && typeof message.includeInherited === 'boolean';
}
function isAttributeDetailsWebviewMessage(message) {
    return typeof message === 'object' && message !== null && 'command' in message && message.command === 'attributeDetailsReady';
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
    return message.command === 'classObjectsReady' || message.command === 'refreshClassObjects' || isCopyTableCellsMessage(message);
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
function isExplorerWebviewMessage(message) {
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