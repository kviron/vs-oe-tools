import * as vscode from 'vscode';
import { getMethodSource, saveMethodSource, type MethodSource } from '../../infrastructure/database/methodRepository';

const scheme = 'vc-ve-method';

export class MethodEditorProvider implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private readonly methods = new Map<string, MethodSource>();
	readonly onDidChangeFile = this.changed.event;

	async open(id: number): Promise<void> {
		const method = await getMethodSource(id);
		const extension = method.methodType === 3 ? 'pkf' : 'pas';
		const uri = vscode.Uri.from({ scheme, path: `/${safeName(method.name)}-${method.id}.${extension}`, query: `id=${method.id}` });
		this.methods.set(uri.toString(), method);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, extension === 'pkf' ? 've-pkf' : 've-pascal');
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
	}

	watch(): vscode.Disposable { return new vscode.Disposable(() => undefined); }
	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		await this.ensureMethod(uri);
		return { type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: Buffer.byteLength(this.methods.get(uri.toString())?.code ?? '', 'utf8') };
	}
	readDirectory(): [string, vscode.FileType][] { return []; }
	createDirectory(): void { throw vscode.FileSystemError.NoPermissions('Виртуальная папка методов доступна только для чтения.'); }
	async readFile(uri: vscode.Uri): Promise<Uint8Array> { return Buffer.from((await this.ensureMethod(uri)).code, 'utf8'); }
	async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
		const method = await this.ensureMethod(uri);
		const code = Buffer.from(content).toString('utf8');
		await saveMethodSource(method, code);
		method.code = code;
		this.changed.fire([{ type: vscode.FileChangeType.Changed, uri }]);
		vscode.window.setStatusBarMessage(`Метод ${method.name} сохранён в Windows-1251`, 2500);
	}
	delete(): void { throw vscode.FileSystemError.NoPermissions('Удаление метода из редактора запрещено.'); }
	rename(): void { throw vscode.FileSystemError.NoPermissions('Переименование метода из редактора запрещено.'); }
	dispose(): void { this.changed.dispose(); this.methods.clear(); }

	private async ensureMethod(uri: vscode.Uri): Promise<MethodSource> {
		const cached = this.methods.get(uri.toString());
		if (cached) {
			return cached;
		}
		const id = Number(new URLSearchParams(uri.query).get('id'));
		if (!Number.isSafeInteger(id)) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		const method = await getMethodSource(id);
		this.methods.set(uri.toString(), method);
		return method;
	}
}

export function registerMethodEditor(context: vscode.ExtensionContext): MethodEditorProvider {
	const provider = new MethodEditorProvider();
	context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(scheme, provider, { isCaseSensitive: true }));
	return provider;
}

function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, '_') || 'method'; }
