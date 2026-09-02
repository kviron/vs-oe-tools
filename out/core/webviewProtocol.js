"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClassDetailsWebviewMessage = isClassDetailsWebviewMessage;
exports.isExplorerWebviewMessage = isExplorerWebviewMessage;
exports.isSqlMonitorWebviewMessage = isSqlMonitorWebviewMessage;
exports.isSqlExecutorWebviewMessage = isSqlExecutorWebviewMessage;
function isClassDetailsWebviewMessage(message) {
    return typeof message === 'object'
        && message !== null
        && 'command' in message
        && (message.command === 'classDetailsReady' || message.command === 'loadClassAttributes');
}
function isExplorerWebviewMessage(message) {
    if (typeof message !== 'object' || message === null || !('command' in message)) {
        return false;
    }
    if (message.command === 'loadClasses') {
        return true;
    }
    return message.command === 'openClass' && 'id' in message && 'pinned' in message
        && typeof message.id === 'number' && typeof message.pinned === 'boolean';
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
    return message.command === 'executeSql' && 'text' in message && typeof message.text === 'string';
}
//# sourceMappingURL=webviewProtocol.js.map