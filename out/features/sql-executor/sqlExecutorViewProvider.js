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
exports.SqlExecutorViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const sqlMonitorService_1 = require("../sql-monitor/sqlMonitorService");
const executeSql_1 = require("./executeSql");
class SqlExecutorViewProvider {
    extensionUri;
    static viewType = 'vc-ve-tools.sqlExecutor';
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
        webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);
        const historySubscription = sqlMonitorService_1.sqlMonitorService.subscribe(record => {
            void webviewView.webview.postMessage({
                command: 'sqlExecutorHistoryChanged',
                entry: toHistoryEntry(record),
            });
        });
        webviewView.onDidDispose(() => historySubscription.dispose());
        webviewView.webview.onDidReceiveMessage((message) => {
            if (!(0, webviewProtocol_1.isSqlExecutorWebviewMessage)(message)) {
                return;
            }
            if (message.command === 'sqlExecutorReady') {
                void webviewView.webview.postMessage({
                    command: 'sqlExecutorInitialized',
                    history: sqlMonitorService_1.sqlMonitorService.getRecords().map(toHistoryEntry),
                });
                return;
            }
            void this.runQuery(webviewView.webview, message.text);
        });
    }
    async runQuery(webview, text) {
        try {
            const execution = await (0, executeSql_1.executeSql)(text);
            void webview.postMessage({
                command: 'sqlExecutionSucceeded',
                ...execution,
            });
        }
        catch (error) {
            void webview.postMessage({
                command: 'sqlExecutionFailed',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    getHtml(webview, assetsRoot) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'sql-executor.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'sql-executor.css'));
        const nonce = createNonce();
        return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>Исполнитель SQL</title></head>
<body><div id="app">Загрузка исполнителя SQL…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
    }
}
exports.SqlExecutorViewProvider = SqlExecutorViewProvider;
function toHistoryEntry(record) {
    return {
        id: record.id,
        startedAt: record.startedAt,
        source: record.source,
        operation: record.operation,
        text: record.text,
    };
}
function createNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
//# sourceMappingURL=sqlExecutorViewProvider.js.map