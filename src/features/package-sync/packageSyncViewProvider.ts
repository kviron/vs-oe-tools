import * as vscode from 'vscode';
import { access, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PackageSyncHostMessage } from '../../core/webviewProtocol';
import { isPackageSyncWebviewMessage } from '../../core/webviewProtocol';
import type { PackageSyncIssue, PackageSyncItem, PackageSyncSnapshot, SvnMergeResult } from './models';
import { SvnConflictPanel } from './svnConflictPanel';
import { mergePackageRevision } from './svnMergeService';

export class PackageSyncPanelManager implements vscode.Disposable {
	static readonly viewType = 'vc-ve-tools.packageSync';
	private panel?: vscode.WebviewPanel;
	private items: PackageSyncItem[] = [];
	private issues: PackageSyncIssue[] = [];
	private mergeWorkingCopy?: string;
	private mergeResult?: SvnMergeResult;
	private readonly conflictPanel: SvnConflictPanel;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly loadSnapshot: () => Promise<PackageSyncSnapshot>,
		private readonly loadDatabaseVersion: (item: PackageSyncItem, fileName: string) => Promise<{ content: string; addedObjectIds: number[]; localContent?: string }>,
	) { this.conflictPanel = new SvnConflictPanel(extensionUri, filePath => { void this.markConflictResolved(filePath); }); }

	show(): void {
		if (this.panel) {
			this.panel.reveal(undefined, false);
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			PackageSyncPanelManager.viewType,
			'Синхронизация проектов',
			vscode.ViewColumn.Active,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		this.panel = panel;
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		panel.webview.html = this.html(panel.webview, assetsRoot);
		panel.webview.onDidReceiveMessage((message: unknown) => {
			if (!isPackageSyncWebviewMessage(message)) {return;}
			if (message.command === 'packageSyncReady' || message.command === 'refreshPackageSync') {
				void this.refresh();
				return;
			}
			if (message.command === 'mergeSvnRevision') { void this.merge(message.branch, message.revision); return; }
			if (message.command === 'openSvnConflict') {
				if (this.mergeWorkingCopy) { void this.conflictPanel.show(this.mergeWorkingCopy, message.path).catch(error => vscode.window.showErrorMessage(`Не удалось открыть конфликт: ${errorMessage(error)}`)); }
				return;
			}
			const item = this.items.find(candidate => candidate.objectId === message.objectId);
			if (!item?.localPath) {
				void vscode.window.showWarningMessage(`Для объекта ${message.objectId} не удалось определить локальный путь.`);
				return;
			}
			void this.openDiff(item);
		});
		panel.onDidDispose(() => { this.panel = undefined; });
	}

	refreshForDatabaseChange(): void { if (this.panel) {void this.refresh();} }
	dispose(): void { this.panel?.dispose(); this.conflictPanel.dispose(); }

	private async merge(branch: string, revision: number): Promise<void> {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) { await this.post({ command: 'svnMergeFailed', message: 'Сначала откройте папку проекта Восточного Экспресса.' }); return; }
		const answer = await vscode.window.showWarningMessage(
			`Выполнить merge ревизии r${revision}?`,
			{ modal: true, detail: `Источник: ${branch}\nРабочая копия: ${path.join(workspacePath, 'packages')}\nCommit выполняться не будет.` },
			'Выполнить merge',
		);
		if (answer !== 'Выполнить merge') { await this.post({ command: 'svnMergeCancelled' }); return; }
		await this.post({ command: 'svnMergeStarted' });
		try {
			const result = await mergePackageRevision(workspacePath, branch, revision);
			this.mergeWorkingCopy = result.workingCopy;
			this.mergeResult = result;
			await this.post({ command: 'svnMergeCompleted', result });
		} catch (error) {
			await this.post({ command: 'svnMergeFailed', message: errorMessage(error) });
		}
	}

	private async markConflictResolved(filePath: string): Promise<void> {
		if (!this.mergeResult) { return; }
		const normalized = path.normalize(filePath).toLocaleLowerCase('ru');
		const workingCopy = this.mergeResult.workingCopy;
		this.mergeResult = {
			...this.mergeResult,
			files: this.mergeResult.files.map(file => path.normalize(path.join(workingCopy, file.path)).toLocaleLowerCase('ru') === normalized
				? { ...file, conflicted: false, treeConflict: false, status: file.status === 'conflicted' ? 'modified' : file.status }
				: file),
		};
		await this.post({ command: 'svnMergeCompleted', result: this.mergeResult });
	}

	private async openDiff(item: PackageSyncItem): Promise<void> {
		try {
			const fileName = await resolvePackageFile(item);
			item.localPath = fileName;
			await this.post({ command: 'packageSyncLoaded', items: this.items, issues: this.issues });
			let databaseError: unknown;
			try {
				const version = await this.loadDatabaseVersion(item, fileName);
				await vscode.commands.executeCommand('vc-ve-tools.openPackageDatabaseDiff', fileName, version.content, version.localContent);
				vscode.window.setStatusBarMessage(`Версия PKF собрана из БД · добавлено объектов: ${version.addedObjectIds.length}`, 5000);
				return;
			} catch (error) {
				databaseError = error;
			}
			try {
				const generatedFileName = await findOriginalClientGeneratedFile(fileName);
				await vscode.commands.executeCommand('vc-ve-tools.openGeneratedPackageDiff', fileName, generatedFileName);
			} catch (fallbackError) {
				throw new Error(`Из БД: ${errorMessage(databaseError)} Резервный способ: ${errorMessage(fallbackError)}`);
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось открыть сравнение: ${errorMessage(error)}`);
		}
	}

	private async refresh(): Promise<void> {
		await this.post({ command: 'packageSyncLoading' });
		try {
			const snapshot = await this.loadSnapshot();
			this.items = snapshot.items;
			this.issues = snapshot.issues;
			await this.post({ command: 'packageSyncLoaded', ...snapshot });
		} catch (error) {
			await this.post({ command: 'packageSyncFailed', message: error instanceof Error ? error.message : String(error) });
		}
	}

	private async post(message: PackageSyncHostMessage): Promise<void> { await this.panel?.webview.postMessage(message); }

	private html(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const script = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'package-sync.js'));
		const style = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
		const nonce = Math.random().toString(36).slice(2);
		return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"><title>Синхронизация пакетов</title></head><body><div id="app"></div><script type="module" nonce="${nonce}" src="${script}"></script></body></html>`;
	}
}

const execFileAsync = promisify(execFile);

async function findOriginalClientGeneratedFile(localFileName: string): Promise<string> {
	const script = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter "Name='TortoiseMerge.exe'" | Select-Object -ExpandProperty CommandLine | ConvertTo-Json -Compress`;
	let stdout: string;
	try {
		({ stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' }));
	} catch {
		throw new Error('Не удалось получить параметры TortoiseMerge.');
	}
	if (!stdout.trim()) {
		throw new Error('Сначала откройте сравнение этого файла в оригинальном клиенте.');
	}
	let commandLines: string[];
	try {
		const parsed: unknown = JSON.parse(stdout);
		commandLines = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : typeof parsed === 'string' ? [parsed] : [];
	} catch {
		commandLines = [stdout];
	}
	const normalizedLocal = path.normalize(localFileName).toLocaleLowerCase('ru');
	for (const commandLine of commandLines) {
		const base = commandLine.match(/\/base:"([^"]+)"/i)?.[1];
		const mine = commandLine.match(/\/mine:"([^"]+)"/i)?.[1];
		if (!base || !mine || path.normalize(base).toLocaleLowerCase('ru') !== normalizedLocal) {continue;}
		try {
			await access(mine);
			return mine;
		} catch {
			throw new Error(`Временная версия оригинального клиента уже удалена: ${mine}`);
		}
	}
	throw new Error('Откройте сравнение выбранного файла в оригинальном клиенте и повторите попытку.');
}

async function resolveExistingFile(fileName: string): Promise<string> {
	try {
		await access(fileName);
		return fileName;
	} catch {
		// SysPackageBase may expose a logical path without the physical file extension.
	}
	if (path.extname(fileName)) {throw new Error(`Локальный файл не найден: ${fileName}`);}
	const directory = path.dirname(fileName);
	const stem = path.basename(fileName).toLocaleLowerCase('ru');
	let entries: string[];
	try {
		entries = await readdir(directory);
	} catch {
		throw new Error(`Локальный каталог не найден: ${directory}`);
	}
	const matches = entries.filter(entry => path.parse(entry).name.toLocaleLowerCase('ru') === stem);
	const priority = ['.pkf', '.pas', '.bat'];
	matches.sort((left, right) => {
		const leftIndex = priority.indexOf(path.extname(left).toLocaleLowerCase('en-US'));
		const rightIndex = priority.indexOf(path.extname(right).toLocaleLowerCase('en-US'));
		return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex);
	});
	const match = matches[0];
	if (!match) {throw new Error(`Локальный файл не найден: ${fileName} (файл с таким именем и расширением отсутствует)`);}
	return path.join(directory, match);
}

async function resolvePackageFile(item: PackageSyncItem): Promise<string> {
	try {
		return await resolveExistingFile(item.localPath!);
	} catch (error) {
		if (item.contentMd5) {throw error;}
		return path.extname(item.localPath!) ? item.localPath! : `${item.localPath!}.pkf`;
	}
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
