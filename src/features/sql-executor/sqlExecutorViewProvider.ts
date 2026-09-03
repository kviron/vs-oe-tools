import * as vscode from 'vscode';
import type { SqlExecutorHostMessage, SqlHistoryEntry } from '../../core/webviewProtocol';
import { isSqlExecutorWebviewMessage } from '../../core/webviewProtocol';
import type { SerializedQueryResult } from '../../infrastructure/database/databaseQueryExecutor';
import type { SqlQueryRecord } from '../sql-monitor/models';
import { sqlMonitorService } from '../sql-monitor/sqlMonitorService';
import { executeSql } from './executeSql';
import { formatSqlResult, sqlResultExportDefinitions } from './sqlResultExport';
import { logTableSelection } from '../../core/tableSelectionLogger';

export class SqlExecutorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'vc-ve-tools.sqlExecutor';

	public constructor(private readonly extensionUri: vscode.Uri) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		let latestResult: SerializedQueryResult | undefined;
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
		webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
			if (!isSqlExecutorWebviewMessage(message)) {
				return;
			}
			if (message.command === 'tableSelectionDebug') {
				logTableSelection('Исполнитель SQL', message.message);
				return;
			}
			if (message.command === 'copyTableCells') {
				await vscode.env.clipboard.writeText(message.text);
				return;
			}
			if (message.command === 'sqlExecutorReady') {
				void webviewView.webview.postMessage({
					command: 'sqlExecutorInitialized',
					history: sqlMonitorService.getRecords().map(toHistoryEntry),
				} satisfies SqlExecutorHostMessage);
				return;
			}
			if (message.command === 'executeSql') {
				void this.runQuery(webviewView.webview, message.text, result => { latestResult = result; });
			} else if (message.command === 'copySqlResult') {
				void this.copyResult(latestResult, message.format);
			} else if (message.command === 'copySqlError') {
				void this.copyError(message.text);
			} else {
				void this.exportResult(latestResult);
			}
		});
	}

	private async runQuery(webview: vscode.Webview, text: string, onResult: (result: SerializedQueryResult) => void): Promise<void> {
		try {
			const execution = await executeSql(text);
			onResult(execution.result);
			void webview.postMessage({
				command: 'sqlExecutionSucceeded',
				...execution,
			} satisfies SqlExecutorHostMessage);
		} catch (error) {
			void webview.postMessage({
				command: 'sqlExecutionFailed',
				message: error instanceof Error ? error.message : String(error),
				details: formatSqlError(error),
			} satisfies SqlExecutorHostMessage);
		}
	}

	private async copyError(text: string): Promise<void> {
		try {
			await vscode.env.clipboard.writeText(text);
			vscode.window.setStatusBarMessage('Текст ошибки SQL скопирован', 2500);
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось скопировать ошибку SQL: ${errorMessage(error)}`);
		}
	}

	private async copyResult(result: SerializedQueryResult | undefined, format: 'markdown' | 'json'): Promise<void> {
		if (!result) {
			return;
		}
		try {
			await vscode.env.clipboard.writeText(formatSqlResult(result, format));
			void vscode.window.showInformationMessage(format === 'json'
				? 'Результат SQL скопирован в формате JSON.'
				: 'Результат SQL скопирован как читаемая таблица.');
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось скопировать результат SQL: ${errorMessage(error)}`);
		}
	}

	private async exportResult(result: SerializedQueryResult | undefined): Promise<void> {
		if (!result) {
			return;
		}
		const selected = await vscode.window.showQuickPick(sqlResultExportDefinitions, {
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
			await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(formatSqlResult(result, selected.format)));
			void vscode.window.showInformationMessage(`Результат SQL выгружен: ${uri.fsPath}`);
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось выгрузить результат SQL: ${errorMessage(error)}`);
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

function fileTimestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function formatSqlError(error: unknown): string {
	if (typeof error !== 'object' || error === null) {
		return String(error);
	}
	const value = error as Record<string, unknown>;
	const lines: string[] = [];
	const fields: Array<[string, string]> = [
		['Сообщение', 'message'], ['Код PostgreSQL', 'code'], ['Важность', 'severity'],
		['Подробности', 'detail'], ['Подсказка', 'hint'], ['Позиция', 'position'],
		['Внутренняя позиция', 'internalPosition'], ['Внутренний запрос', 'internalQuery'],
		['Контекст', 'where'], ['Схема', 'schema'], ['Таблица', 'table'], ['Столбец', 'column'],
		['Тип данных', 'dataType'], ['Ограничение', 'constraint'], ['Процедура', 'routine'],
	];
	for (const [label, key] of fields) {
		const field = value[key];
		if (field !== undefined && field !== null && String(field).length > 0) {
			lines.push(`${label}: ${String(field)}`);
		}
	}
	if (typeof value.stack === 'string' && value.stack.length > 0) {
		lines.push('', 'Стек:', value.stack);
	}
	return lines.join('\n') || String(error);
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
