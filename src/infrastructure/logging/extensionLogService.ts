import * as vscode from 'vscode';
import type { SqlQueryRecord } from '../../features/sql-monitor/models';
import { sqlMonitorService } from '../../features/sql-monitor/sqlMonitorService';

export type ExtensionLogLevel = 'info' | 'warning' | 'error';
export interface ExtensionLogRecord {
	timestamp: string;
	level: ExtensionLogLevel;
	source: string;
	message: string;
	details?: string;
}

const recordLimit = 300;

export class ExtensionLogService implements vscode.Disposable {
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс');
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	private readonly records: ExtensionLogRecord[] = [];
	private readonly subscriptions: vscode.Disposable[] = [];
	private persistQueue = Promise.resolve();
	private readonly extensionRoot: string;
	readonly logUri: vscode.Uri;
	readonly onDidChange = this.changeEmitter.event;

	constructor(storageUri: vscode.Uri, extensionRoot: string) {
		this.logUri = vscode.Uri.joinPath(storageUri, 'extension-log.jsonl');
		this.extensionRoot = normalizePath(extensionRoot);
		this.subscriptions.push(sqlMonitorService.subscribe(record => this.captureSqlError(record)));
		process.on('unhandledRejection', this.onUnhandledRejection);
		process.on('uncaughtExceptionMonitor', this.onUncaughtException);
	}

	async initialize(): Promise<void> {
		try {
			const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.logUri));
			for (const line of content.split(/\r?\n/).filter(Boolean).slice(-recordLimit)) {
				try {
					this.records.push(JSON.parse(line) as ExtensionLogRecord);
				} catch { /* Ignore a partially written record. */ }
			}
		} catch { /* The journal is created on the first record. */ }
	}

	info(source: string, message: string, details?: unknown): void {
		this.add('info', source, message, details);
	}

	warning(source: string, message: string, details?: unknown): void {
		this.add('warning', source, message, details);
	}

	error(source: string, message: string, details?: unknown): void {
		this.add('error', source, message, details);
	}

	getLastError(): ExtensionLogRecord | undefined {
		for (let index = this.records.length - 1; index >= 0; index -= 1) {
			if (this.records[index].level === 'error') {
				return this.records[index];
			}
		}
		return undefined;
	}

	async clear(): Promise<void> {
		this.records.length = 0;
		this.output.clear();
		await this.persist();
		this.changeEmitter.fire();
	}

	dispose(): void {
		process.off('unhandledRejection', this.onUnhandledRejection);
		process.off('uncaughtExceptionMonitor', this.onUncaughtException);
		this.subscriptions.forEach(subscription => subscription.dispose());
		this.output.dispose();
		this.changeEmitter.dispose();
	}

	private readonly onUnhandledRejection = (reason: unknown): void => {
		if (this.belongsToExtension(reason)) {
			this.error('Extension Host', 'Unhandled promise rejection', reason);
		}
	};

	private readonly onUncaughtException = (error: Error): void => {
		if (this.belongsToExtension(error)) {
			this.error('Extension Host', 'Uncaught exception', error);
		}
	};

	private belongsToExtension(value: unknown): boolean {
		if (!(value instanceof Error)) {
			return false;
		}
		return normalizePath(value.stack ?? '').includes(this.extensionRoot);
	}

	private captureSqlError(record: SqlQueryRecord): void {
		if (record.status === 'error') {
			this.error(record.source, record.error ?? 'Ошибка PostgreSQL', `База: ${record.database}\nSQL: ${record.text.slice(0, 2000)}`);
		}
	}

	private add(level: ExtensionLogLevel, source: string, message: string, details?: unknown): void {
		const record: ExtensionLogRecord = {
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

	private async persist(): Promise<void> {
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.logUri, '..'));
		const content = this.records.map(record => JSON.stringify(record)).join('\n');
		await vscode.workspace.fs.writeFile(this.logUri, new TextEncoder().encode(content ? `${content}\n` : ''));
	}
}

function formatDetails(details: unknown): string {
	if (details instanceof Error) {
		return details.stack ?? details.message;
	}
	return typeof details === 'string' ? details : JSON.stringify(details);
}

function sanitize(value: string): string {
	return value
		.replace(/(password\s*[=:]\s*)[^\s;]+/gi, '$1<redacted>')
		.replace(/(oedbmspassword\s*[=:]\s*)[^\s;]+/gi, '$1<redacted>')
		.slice(0, 10_000);
}

function normalizePath(value: string): string {
	return value.replaceAll('\\', '/').toLowerCase();
}
