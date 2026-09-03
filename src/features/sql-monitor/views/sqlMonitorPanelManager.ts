import * as vscode from 'vscode';
import type { SqlMonitorHostMessage } from '../../../core/webviewProtocol';
import { isSqlMonitorWebviewMessage } from '../../../core/webviewProtocol';
import { sqlMonitorService } from '../sqlMonitorService';
import { logTableSelection } from '../../../core/tableSelectionLogger';

let monitorPanel: vscode.WebviewPanel | undefined;

export function openSqlMonitor(context: vscode.ExtensionContext): void {
	if (monitorPanel) {
		monitorPanel.reveal(vscode.ViewColumn.Active);
		return;
	}

	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.sqlMonitor',
		'SQL-монитор',
		vscode.ViewColumn.Active,
		{ enableScripts: true, localResourceRoots: [assetsRoot] },
	);
	monitorPanel = panel;
	sqlMonitorService.setActive(true);

	const subscription = sqlMonitorService.subscribe(record => {
		void panel.webview.postMessage({ command: 'sqlQueryChanged', record } satisfies SqlMonitorHostMessage);
	});
	panel.webview.onDidReceiveMessage((message: unknown) => {
		if (!isSqlMonitorWebviewMessage(message)) {
			return;
		}
		if (message.command === 'tableSelectionDebug') {
			logTableSelection('SQL-монитор', message.message);
			return;
		}
		if (message.command === 'sqlMonitorReady') {
			void panel.webview.postMessage({
				command: 'sqlMonitorSnapshot',
				records: sqlMonitorService.getRecords(),
			} satisfies SqlMonitorHostMessage);
			return;
		}
		sqlMonitorService.clear();
		void panel.webview.postMessage({ command: 'sqlMonitorCleared' } satisfies SqlMonitorHostMessage);
	});
	panel.onDidDispose(() => {
		subscription.dispose();
		sqlMonitorService.setActive(false);
		monitorPanel = undefined;
	});
	panel.webview.html = getSqlMonitorShell(panel.webview, assetsRoot);
}

export function closeSqlMonitor(): void {
	monitorPanel?.dispose();
}

function getSqlMonitorShell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'sql-monitor.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'sql-monitor.css'));
	const nonce = createNonce();
	return `<!doctype html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>SQL-монитор</title></head>
<body><div id="app">Загрузка SQL-монитора…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
