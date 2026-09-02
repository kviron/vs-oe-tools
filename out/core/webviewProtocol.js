"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClassDetailsWebviewMessage = isClassDetailsWebviewMessage;
exports.isExplorerWebviewMessage = isExplorerWebviewMessage;
exports.isCopyEntityIdMessage = isCopyEntityIdMessage;
exports.isSqlMonitorWebviewMessage = isSqlMonitorWebviewMessage;
exports.isSqlExecutorWebviewMessage = isSqlExecutorWebviewMessage;
function isClassDetailsWebviewMessage(message) {
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
        && (message.command === 'sqlMonitorReady' || message.command === 'clearSqlMonitor');
}
function isSqlExecutorWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'sqlExecutorReady') {
        return true;
    }
    if (message.command === 'executeSql') {
        return 'text' in message && typeof message.text === 'string';
    }
    if (message.command === 'copySqlResult') {
        return 'format' in message && (message.format === 'markdown' || message.format === 'json');
    }
    return message.command === 'exportSqlResult';
}
//# sourceMappingURL=webviewProtocol.js.map