"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCodeHistoryWebviewMessage = isCodeHistoryWebviewMessage;
exports.isClassDetailsWebviewMessage = isClassDetailsWebviewMessage;
exports.isExplorerWebviewMessage = isExplorerWebviewMessage;
exports.isCopyEntityIdMessage = isCopyEntityIdMessage;
exports.isSqlMonitorWebviewMessage = isSqlMonitorWebviewMessage;
exports.isSqlExecutorWebviewMessage = isSqlExecutorWebviewMessage;
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
    if (isTableSelectionDebugMessage(message)) {
        return true;
    }
    if (message.command === 'loadClassAttributes') {
        return 'includeInherited' in message && typeof message.includeInherited === 'boolean';
    }
    if (message.command === 'openMethod') {
        return 'id' in message && typeof message.id === 'number';
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
    return message.command === 'loadClassMethods'
        && 'includeInherited' in message
        && typeof message.includeInherited === 'boolean';
}
function isExplorerWebviewMessage(message) {
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
        && (message.command === 'sqlMonitorReady' || message.command === 'clearSqlMonitor' || isTableSelectionDebugMessage(message) || isCopyTableCellsMessage(message));
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