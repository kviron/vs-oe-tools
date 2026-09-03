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
exports.openSqlMonitor = openSqlMonitor;
exports.closeSqlMonitor = closeSqlMonitor;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../../core/webviewProtocol");
const sqlMonitorService_1 = require("../sqlMonitorService");
const tableSelectionLogger_1 = require("../../../core/tableSelectionLogger");
let monitorPanel;
function openSqlMonitor(context) {
    if (monitorPanel) {
        monitorPanel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.sqlMonitor', 'SQL-монитор', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [assetsRoot] });
    monitorPanel = panel;
    sqlMonitorService_1.sqlMonitorService.setActive(true);
    const subscription = sqlMonitorService_1.sqlMonitorService.subscribe(record => {
        void panel.webview.postMessage({ command: 'sqlQueryChanged', record });
    });
    panel.webview.onDidReceiveMessage((message) => {
        if (!(0, webviewProtocol_1.isSqlMonitorWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'tableSelectionDebug') {
            (0, tableSelectionLogger_1.logTableSelection)('SQL-монитор', message.message);
            return;
        }
        if (message.command === 'sqlMonitorReady') {
            void panel.webview.postMessage({
                command: 'sqlMonitorSnapshot',
                records: sqlMonitorService_1.sqlMonitorService.getRecords(),
            });
            return;
        }
        sqlMonitorService_1.sqlMonitorService.clear();
        void panel.webview.postMessage({ command: 'sqlMonitorCleared' });
    });
    panel.onDidDispose(() => {
        subscription.dispose();
        sqlMonitorService_1.sqlMonitorService.setActive(false);
        monitorPanel = undefined;
    });
    panel.webview.html = getSqlMonitorShell(panel.webview, assetsRoot);
}
function closeSqlMonitor() {
    monitorPanel?.dispose();
}
function getSqlMonitorShell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'sql-monitor.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'sql-monitor.css'));
    const nonce = createNonce();
    return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>SQL-монитор</title></head>
<body><div id="app">Загрузка SQL-монитора…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
function createNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
//# sourceMappingURL=sqlMonitorPanelManager.js.map