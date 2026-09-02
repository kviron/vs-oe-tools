import * as vscode from 'vscode';
import type { SqlExecutorHostMessage, SqlHistoryEntry } from '../../core/webviewProtocol';
import { isSqlExecutorWebviewMessage } from '../../core/webviewProtocol';
import type { SqlQueryRecord } from '../sql-monitor/models';
import { sqlMonitorService } from '../sql-monitor/sqlMonitorService';
import { executeSql } from './executeSql';

export class SqlExecutorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'vc-ve-tools.sqlExecutor';

	public constructor(private readonly extensionUri: vscode.Uri) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		webviewView.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		webviewView.webview.html = this.getHtml(webviewView.webview, assetsRoot);

		const historySubscription = sqlMonitorService.subscribe(record => {
			void webviewView.webview.postMessage({
				command: 'sqlExecutorHistoryChanged',
				entry: toHistoryEntry(record),
			} satisfies SqlExecutorHostMessage);
		});
		webviewView.onDidDispose(() => historySubscription.dispose());
		webviewView.webview.onDidReceiveMessage((message: unknown) => {
			if (!isSqlExecutorWebviewMessage(message)) {
				return;
			}
			if (message.command === 'sqlExecutorReady') {
				void webviewView.webview.postMessage({
					command: 'sqlExecutorInitialized',
					history: sqlMonitorService.getRecords().map(toHistoryEntry),
				} satisfies SqlExecutorHostMessage);
				return;
			}
			void this.runQuery(webviewView.webview, message.text);
		});
	}

	private async runQuery(webview: vscode.Webview, text: string): Promise<void> {
		try {
			const execution = await executeSql(text);
			void webview.postMessage({
				command: 'sqlExecutionSucceeded',
				...execution,
			} satisfies SqlExecutorHostMessage);
		} catch (error) {
			void webview.postMessage({
				command: 'sqlExecutionFailed',
				message: error instanceof Error ? error.message : String(error),
			} satisfies SqlExecutorHostMessage);
		}
	}

	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
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

function toHistoryEntry(record: SqlQueryRecord): SqlHistoryEntry {
	return {
		id: record.id,
		startedAt: record.startedAt,
		source: record.source,
		operation: record.operation,
		text: record.text,
	};
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}

