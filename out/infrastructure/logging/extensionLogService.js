"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionLogService = void 0;
const vscode = __importStar(require("vscode"));
const sqlMonitorService_1 = require("../../features/sql-monitor/sqlMonitorService");
const recordLimit = 300;
class ExtensionLogService {
    output = vscode.window.createOutputChannel('Восточный Экспресс');
    changeEmitter = new vscode.EventEmitter();
    records = [];
    subscriptions = [];
    persistQueue = Promise.resolve();
    extensionRoot;
    logUri;
    onDidChange = this.changeEmitter.event;
    constructor(storageUri, extensionRoot) {
        this.logUri = vscode.Uri.joinPath(storageUri, 'extension-log.jsonl');
        this.extensionRoot = normalizePath(extensionRoot);
        this.subscriptions.push(sqlMonitorService_1.sqlMonitorService.subscribe(record => this.captureSqlError(record)));
        process.on('unhandledRejection', this.onUnhandledRejection);
        process.on('uncaughtExceptionMonitor', this.onUncaughtException);
    }
    async initialize() {
        try {
            const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.logUri));
            for (const line of content.split(/\r?\n/).filter(Boolean).slice(-recordLimit)) {
                try {
                    this.records.push(JSON.parse(line));
                }
                catch { /* Ignore a partially written record. */ }
            }
        }
        catch { /* The journal is created on the first record. */ }
    }
    info(source, message, details) {
        this.add('info', source, message, details);
    }
    warning(source, message, details) {
        this.add('warning', source, message, details);
    }
    error(source, message, details) {
        this.add('error', source, message, details);
    }
    getLastError() {
        for (let index = this.records.length - 1; index >= 0; index -= 1) {
            if (this.records[index].level === 'error') {
                return this.records[index];
            }
        }
        return undefined;
    }
    async clear() {
        this.records.length = 0;
        this.output.clear();
        await this.persist();
        this.changeEmitter.fire();
    }
    dispose() {
        process.off('unhandledRejection', this.onUnhandledRejection);
        process.off('uncaughtExceptionMonitor', this.onUncaughtException);
        this.subscriptions.forEach(subscription => subscription.dispose());
        this.output.dispose();
        this.changeEmitter.dispose();
    }
    onUnhandledRejection = (reason) => {
        if (this.belongsToExtension(reason)) {
            this.error('Extension Host', 'Unhandled promise rejection', reason);
        }
    };
    onUncaughtException = (error) => {
        if (this.belongsToExtension(error)) {
            this.error('Extension Host', 'Uncaught exception', error);
        }
    };
    belongsToExtension(value) {
        if (!(value instanceof Error)) {
            return false;
        }
        return normalizePath(value.stack ?? '').includes(this.extensionRoot);
    }
    captureSqlError(record) {
        if (record.status === 'error') {
            this.error(record.source, record.error ?? 'Ошибка PostgreSQL', `База: ${record.database}\nSQL: ${record.text.slice(0, 2000)}`);
        }
    }
    add(level, source, message, details) {
        const record = {
            timestamp: new Date().toISOString(),
            level,
            source: sanitize(source),
            message: sanitize(message),
            details: details === undefined ? undefined : sanitize(formatDetails(details)),
        };
        this.records.push(record);
        if (this.records.length > recordLimit) {
            this.records.splice(0, this.records.length - recordLimit);
        }
        this.output.appendLine(`[${record.timestamp}] ${level.toUpperCase()} ${record.source}: ${record.message}`);
        this.changeEmitter.fire();
        this.persistQueue = this.persistQueue.then(() => this.persist()).catch(() => undefined);
    }
    async persist() {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.logUri, '..'));
        const content = this.records.map(record => JSON.stringify(record)).join('\n');
        await vscode.workspace.fs.writeFile(this.logUri, new TextEncoder().encode(content ? `${content}\n` : ''));
    }
}
exports.ExtensionLogService = ExtensionLogService;
function formatDetails(details) {
    if (details instanceof Error) {
        return details.stack ?? details.message;
    }
    return typeof details === 'string' ? details : JSON.stringify(details);
}
function sanitize(value) {
    return value
        .replace(/(password\s*[=:]\s*)[^\s;]+/gi, '$1<redacted>')
        .replace(/(oedbmspassword\s*[=:]\s*)[^\s;]+/gi, '$1<redacted>')
        .slice(0, 10_000);
}
function normalizePath(value) {
    return value.replaceAll('\\', '/').toLowerCase();
}
//# sourceMappingURL=extensionLogService.js.map