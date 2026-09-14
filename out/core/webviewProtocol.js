"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSqlMonitorWebviewMessage = exports.isSqlExecutorWebviewMessage = exports.isOpenClientEntityMessage = exports.isCopyEntityIdMessage = void 0;
exports.isNativeLogsWebviewMessage = isNativeLogsWebviewMessage;
exports.isProductionTasksWebviewMessage = isProductionTasksWebviewMessage;
exports.isProductionTaskDetailsWebviewMessage = isProductionTaskDetailsWebviewMessage;
exports.isSettingsWebviewMessage = isSettingsWebviewMessage;
exports.isPackageSyncWebviewMessage = isPackageSyncWebviewMessage;
exports.isSvnConflictWebviewMessage = isSvnConflictWebviewMessage;
exports.isCodeHistoryWebviewMessage = isCodeHistoryWebviewMessage;
exports.isClassDetailsWebviewMessage = isClassDetailsWebviewMessage;
exports.isAttributeDetailsWebviewMessage = isAttributeDetailsWebviewMessage;
exports.isPropertyDetailsWebviewMessage = isPropertyDetailsWebviewMessage;
exports.isClassObjectsWebviewMessage = isClassObjectsWebviewMessage;
exports.isSpuEditorWebviewMessage = isSpuEditorWebviewMessage;
exports.isObjectViewWebviewMessage = isObjectViewWebviewMessage;
exports.isPackageContentWebviewMessage = isPackageContentWebviewMessage;
exports.isExplorerWebviewMessage = isExplorerWebviewMessage;
const commonMessages_1 = require("./webview/commonMessages");
var commonMessages_2 = require("./webview/commonMessages");
Object.defineProperty(exports, "isCopyEntityIdMessage", { enumerable: true, get: function () { return commonMessages_2.isCopyEntityIdMessage; } });
Object.defineProperty(exports, "isOpenClientEntityMessage", { enumerable: true, get: function () { return commonMessages_2.isOpenClientEntityMessage; } });
var sqlMessages_1 = require("./webview/sqlMessages");
Object.defineProperty(exports, "isSqlExecutorWebviewMessage", { enumerable: true, get: function () { return sqlMessages_1.isSqlExecutorWebviewMessage; } });
Object.defineProperty(exports, "isSqlMonitorWebviewMessage", { enumerable: true, get: function () { return sqlMessages_1.isSqlMonitorWebviewMessage; } });
function isNativeLogsWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'nativeLogsReady' || message.command === 'refreshNativeLogs') {
        return true;
    }
    if (message.command === 'openNativeLog') {
        return 'fileName' in message && typeof message.fileName === 'string';
    }
    return message.command === 'copyNativeLog' && 'text' in message && typeof message.text === 'string';
}
function isProductionTasksWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
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
        || message.command === 'loadProductionTaskActions'
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
    if (message.command === 'startHttpTestServer') {
        return 'methodName' in message && typeof message.methodName === 'string' && message.methodName.trim().length > 0;
    }
    if (message.command === 'searchHttpParameterValues') {
        return 'parameter' in message && typeof message.parameter === 'string'
            && 'typeName' in message && typeof message.typeName === 'string'
            && 'query' in message && typeof message.query === 'string';
    }
    if (message.command === 'copyHttpApiRequest') {
        return 'text' in message && typeof message.text === 'string' && message.text.length > 0
            && (!('notification' in message) || message.notification === undefined || typeof message.notification === 'string');
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
        || (message.command === 'openPackageSyncDiff' && 'objectId' in message && typeof message.objectId === 'number')
        || (message.command === 'openSvnConflict' && 'path' in message && typeof message.path === 'string')
        || (message.command === 'mergeSvnRevision' && 'branch' in message && typeof message.branch === 'string'
            && 'revision' in message && typeof message.revision === 'number' && Number.isSafeInteger(message.revision) && message.revision > 0);
}
function isSvnConflictWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'svnConflictReady'
        || (message.command === 'saveSvnConflict' && 'content' in message && typeof message.content === 'string'
            && 'resolve' in message && typeof message.resolve === 'boolean');
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
    if ((0, commonMessages_1.isTableSelectionDebugMessage)(message)) {
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
    if ((0, commonMessages_1.isCopyEntityIdMessage)(message)) {
        return true;
    }
    if ((0, commonMessages_1.isOpenClientEntityMessage)(message)) {
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
        || (0, commonMessages_1.isCopyTableCellsMessage)(message) || (0, commonMessages_1.isCopyEntityIdMessage)(message) || (0, commonMessages_1.isOpenClientEntityMessage)(message);
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
        || (0, commonMessages_1.isCopyTableCellsMessage)(message)
        || (0, commonMessages_1.isTableSelectionDebugMessage)(message);
}
function isPackageContentWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    return message.command === 'packageContentReady'
        || message.command === 'refreshPackageContent'
        || (0, commonMessages_1.isCopyTableCellsMessage)(message)
        || (0, commonMessages_1.isTableSelectionDebugMessage)(message)
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
    if ((0, commonMessages_1.isCopyEntityIdMessage)(message)) {
        return true;
    }
    if ((0, commonMessages_1.isOpenClientEntityMessage)(message)) {
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
//# sourceMappingURL=webviewProtocol.js.map