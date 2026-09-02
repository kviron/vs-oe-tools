import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { getMethodSource, saveMethodSource, type MethodSource } from '../../infrastructure/database/methodRepository';

const scheme = 'vc-ve-method';

export class MethodEditorProvider implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private readonly methods = new Map<string, MethodSource>();
	private readonly sessionRevision = Date.now();
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Методы');
	readonly onDidChangeFile = this.changed.event;

	async open(id: number): Promise<void> {
		this.log(`Открытие метода ID=${id}.`);
		const method = await getMethodSource(id);
		this.log(`Код получен из БД: type=${method.codeType}; ${inspectText(method.code)}.`);
		const extension = method.methodType === 3 ? 'pkf' : 'pas';
		const languageId = extension === 'pkf' ? 've-pkf' : 've-pascal';
		await ensureWindows1251(languageId);
		// A revision makes VS Code read the bytes again instead of restoring a stale UTF-8 document buffer.
		const uri = vscode.Uri.from({ scheme, path: `/${safeName(method.name)}-${method.id}.${extension}`, query: `id=${method.id}&revision=${this.sessionRevision}` });
		this.methods.set(uri.toString(), method);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, languageId);
		this.log(`Документ открыт: language=${document.languageId}; ${inspectText(document.getText())}.`);
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
	}

	watch(): vscode.Disposable { return new vscode.Disposable(() => undefined); }
	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		await this.ensureMethod(uri);
		return { type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: iconv.encode(this.methods.get(uri.toString())?.code ?? '', 'win1251').byteLength };
	}
	readDirectory(): [string, vscode.FileType][] { return []; }
	createDirectory(): void { throw vscode.FileSystemError.NoPermissions('Виртуальная папка методов доступна только для чтения.'); }
	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const method = await this.ensureMethod(uri);
		const bytes = iconv.encode(method.code, 'win1251');
		this.log(`readFile ID=${method.id}: bytes=${bytes.byteLength}; source ${inspectText(method.code)}; decoded ${inspectText(iconv.decode(bytes, 'win1251'))}.`);
		return bytes;
	}
	async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
		const method = await this.ensureMethod(uri);
		const code = iconv.decode(Buffer.from(content), 'win1251');
		this.log(`writeFile вызван ID=${method.id}: bytes=${content.byteLength}; decoded ${inspectText(code)}.`);
		try {
			await saveMethodSource(method, code, message => this.log(`[repository] ${message}`));
		} catch (error) {
			this.log(`writeFile завершился ошибкой: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
			this.output.show(true);
			throw error;
		}
		this.log(`writeFile успешно завершён ID=${method.id}.`);
		method.code = code;
		this.changed.fire([{ type: vscode.FileChangeType.Changed, uri }]);
		vscode.window.setStatusBarMessage(`Метод ${method.name} сохранён в Windows-1251`, 2500);
	}
	delete(): void { throw vscode.FileSystemError.NoPermissions('Удаление метода из редактора запрещено.'); }
	rename(): void { throw vscode.FileSystemError.NoPermissions('Переименование метода из редактора запрещено.'); }
	dispose(): void { this.changed.dispose(); this.methods.clear(); this.output.dispose(); }

	private log(message: string): void {
		this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
	}

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

async function ensureWindows1251(languageId: string): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('files', { languageId });
	if (configuration.get<string>('encoding') === 'windows1251') {
		return;
	}
	await configuration.update('encoding', 'windows1251', vscode.ConfigurationTarget.Workspace, true);
}

function inspectText(value: string): string {
	const replacementPositions: number[] = [];
	for (let index = value.indexOf('\uFFFD'); index >= 0; index = value.indexOf('\uFFFD', index + 1)) {
		replacementPositions.push(index);
	}
	const roundTrip = iconv.decode(iconv.encode(value, 'win1251'), 'win1251');
	let unsupportedCount = 0;
	for (let index = 0; index < value.length; index++) {
		if (value[index] !== roundTrip[index]) {
			unsupportedCount++;
		}
	}
	return `chars=${value.length}; U+FFFD=${replacementPositions.length}; positions=${replacementPositions.slice(0, 20).join(',') || '-'}; unsupported=${unsupportedCount}`;
}
