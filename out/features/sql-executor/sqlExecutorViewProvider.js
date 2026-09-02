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
const sqlResultExport_1 = require("./sqlResultExport");
class SqlExecutorViewProvider {
    extensionUri;
    static viewType = 'vc-ve-tools.sqlExecutor';
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        let latestResult;
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
            if (message.command === 'executeSql') {
                void this.runQuery(webviewView.webview, message.text, result => { latestResult = result; });
            }
            else if (message.command === 'copySqlResult') {
                void this.copyResult(latestResult, message.format);
            }
            else {
                void this.exportResult(latestResult);
            }
        });
    }
    async runQuery(webview, text, onResult) {
        try {
            const execution = await (0, executeSql_1.executeSql)(text);
            onResult(execution.result);
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
    async copyResult(result, format) {
        if (!result) {
            return;
        }
        try {
            await vscode.env.clipboard.writeText((0, sqlResultExport_1.formatSqlResult)(result, format));
            void vscode.window.showInformationMessage(format === 'json'
                ? 'Результат SQL скопирован в формате JSON.'
                : 'Результат SQL скопирован как читаемая таблица.');
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось скопировать результат SQL: ${errorMessage(error)}`);
        }
    }
    async exportResult(result) {
        if (!result) {
            return;
        }
        const selected = await vscode.window.showQuickPick(sqlResultExport_1.sqlResultExportDefinitions, {
            placeHolder: 'Выберите формат выгрузки результата SQL',
        });
        if (!selected) {
            return;
        }
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`sql-result-${fileTimestamp()}.${selected.extension}`),
            filters: { [selected.label]: [selected.extension] },
            saveLabel: 'Выгрузить результат',
        });
        if (!uri) {
            return;
        }
        try {
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode((0, sqlResultExport_1.formatSqlResult)(result, selected.format)));
            void vscode.window.showInformationMessage(`Результат SQL выгружен: ${uri.fsPath}`);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось выгрузить результат SQL: ${errorMessage(error)}`);
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
function fileTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
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