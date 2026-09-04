import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { getDfmSource, saveDfmSource, type DfmSource } from './dfmRepository';

const scheme = 'vc-ve-dfm';

export class DfmEditorProvider implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private readonly sources = new Map<string, DfmSource>();
	private readonly sessionRevision = Date.now();
	readonly onDidChangeFile = this.changed.event;
	async getSource(uri: vscode.Uri): Promise<DfmSource> { return this.ensure(uri); }
	async open(classId: number): Promise<void> {
		const source = await getDfmSource(classId);
		await ensureWindows1251();
		const uri = vscode.Uri.from({ scheme, path: `/${safeName(source.className)}-${classId}.dfm`, query: `classId=${classId}&revision=${this.sessionRevision}` });
		this.sources.set(uri.toString(), source);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 've-dfm');
		await vscode.window.showTextDocument(document, { preview: false });
	}
	watch(): vscode.Disposable { return new vscode.Disposable(() => undefined); }
	async stat(uri: vscode.Uri): Promise<vscode.FileStat> { const source = await this.ensure(uri); return { type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: iconv.encode(source.text, 'win1251').byteLength }; }
	readDirectory(): [string, vscode.FileType][] { return []; }
	createDirectory(): void { throw vscode.FileSystemError.NoPermissions(); }
	async readFile(uri: vscode.Uri): Promise<Uint8Array> { return iconv.encode((await this.ensure(uri)).text, 'win1251'); }
	async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
		const source = await this.ensure(uri);
		const saved = await saveDfmSource(source, iconv.decode(Buffer.from(content), 'win1251'));
		this.sources.set(uri.toString(), saved);
		this.changed.fire([{ type: vscode.FileChangeType.Changed, uri }]);
		vscode.window.setStatusBarMessage(`DFM ${source.className} сохранён`, 2500);
	}
	delete(): void { throw vscode.FileSystemError.NoPermissions(); }
	rename(): void { throw vscode.FileSystemError.NoPermissions(); }
	dispose(): void { this.changed.dispose(); this.sources.clear(); }
	private async ensure(uri: vscode.Uri): Promise<DfmSource> {
		const cached = this.sources.get(uri.toString()); if (cached) return cached;
		const id = Number(new URLSearchParams(uri.query).get('classId')); if (!Number.isSafeInteger(id)) throw vscode.FileSystemError.FileNotFound(uri);
		const source = await getDfmSource(id); this.sources.set(uri.toString(), source); return source;
	}
}

export function registerDfmEditor(context: vscode.ExtensionContext): DfmEditorProvider {
	const provider = new DfmEditorProvider();
	context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(scheme, provider, { isCaseSensitive: true }));
	return provider;
}
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, '_') || 'dialog'; }

async function ensureWindows1251(): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('files', { languageId: 've-dfm' });
	if (configuration.get<string>('encoding') === 'windows1251') {
		return;
	}
	await configuration.update('encoding', 'windows1251', vscode.ConfigurationTarget.Workspace, true);
}
