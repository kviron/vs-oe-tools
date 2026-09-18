import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import type { DatabaseConnectionOptions } from '../../core/database';
import { getModuleSource, saveModuleSource, type ModuleSource } from '../../infrastructure/database/moduleRepository';

export const moduleDocumentScheme = 'vc-ve-module';

export class ModuleEditorProvider implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private readonly modules = new Map<string, ModuleSource>();
	private readonly databases = new Map<string, DatabaseConnectionOptions>();
	private readonly revision = Date.now();
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Модули');
	readonly onDidChangeFile = this.changed.event;

	async open(id: number, databaseOptions?: DatabaseConnectionOptions): Promise<void> {
		const module = await getModuleSource(id, databaseOptions);
		const uri = this.uri(module, databaseOptions);
		await ensureWindows1251();
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 've-pascal');
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
	}

	async getModule(uri: vscode.Uri): Promise<ModuleSource> { return this.ensureModule(uri); }
	async save(id: number, code: string, databaseOptions?: DatabaseConnectionOptions): Promise<{ id: number; name: string; changed: boolean }> {
		const module = await getModuleSource(id, databaseOptions);
		const changed = module.code !== code;
		await this.persistModule(module, code, databaseOptions);
		return { id: module.id, name: module.name, changed };
	}
	watch(): vscode.Disposable { return new vscode.Disposable(() => undefined); }
	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const module = await this.ensureModule(uri);
		return { type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: iconv.encode(module.code, 'win1251').byteLength };
	}
	readDirectory(): [string, vscode.FileType][] { return []; }
	createDirectory(): void { throw vscode.FileSystemError.NoPermissions('Виртуальная папка модулей недоступна.'); }
	async readFile(uri: vscode.Uri): Promise<Uint8Array> { return iconv.encode((await this.ensureModule(uri)).code, 'win1251'); }
	async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
		const module = await this.ensureModule(uri);
		const code = iconv.decode(Buffer.from(content), 'win1251');
		await this.persistModule(module, code, this.databases.get(uri.toString()));
	}
	delete(): void { throw vscode.FileSystemError.NoPermissions('Удаление модуля из редактора запрещено.'); }
	rename(): void { throw vscode.FileSystemError.NoPermissions('Переименование модуля из редактора запрещено.'); }
	dispose(): void { this.changed.dispose(); this.modules.clear(); this.databases.clear(); this.output.dispose(); }

	private async persistModule(module: ModuleSource, code: string, databaseOptions?: DatabaseConnectionOptions): Promise<void> {
		await saveModuleSource(module, code, message => this.output.appendLine(`[${new Date().toISOString()}] ${message}`), databaseOptions);
		for (const [key, cached] of this.modules) {
			if (cached.id !== module.id) { continue; }
			cached.code = code;
			this.changed.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse(key) }]);
		}
		vscode.window.setStatusBarMessage(`Модуль ${module.name} сохранён в Windows-1251`, 2500);
	}

	private uri(module: ModuleSource, databaseOptions?: DatabaseConnectionOptions): vscode.Uri {
		const uri = vscode.Uri.from({ scheme: moduleDocumentScheme, path: `/${safeName(module.name)}-${module.id}.pas`, query: `id=${module.id}&revision=${this.revision}` });
		this.modules.set(uri.toString(), module);
		if (databaseOptions) { this.databases.set(uri.toString(), databaseOptions); }
		return uri;
	}

	private async ensureModule(uri: vscode.Uri): Promise<ModuleSource> {
		const cached = this.modules.get(uri.toString());
		if (cached) { return cached; }
		const id = Number(new URLSearchParams(uri.query).get('id'));
		if (!Number.isSafeInteger(id) || id <= 0) { throw vscode.FileSystemError.FileNotFound(uri); }
		const module = await getModuleSource(id, this.databases.get(uri.toString()));
		this.modules.set(uri.toString(), module);
		return module;
	}
}

export function registerModuleEditor(context: vscode.ExtensionContext): ModuleEditorProvider {
	const provider = new ModuleEditorProvider();
	context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(moduleDocumentScheme, provider, { isCaseSensitive: true }));
	return provider;
}

function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]/gu, '_') || 'module'; }
async function ensureWindows1251(): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('files', { languageId: 've-pascal' });
	if (configuration.get<string>('encoding') !== 'windows1251') {
		await configuration.update('encoding', 'windows1251', vscode.ConfigurationTarget.Workspace, true);
	}
}
