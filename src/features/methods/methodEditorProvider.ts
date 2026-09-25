import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { getMethodSource, saveMethodSource, type MethodSource } from '../../infrastructure/database/methodRepository';
import type { ClassMethodDraft, CreatedClassMethod } from '../classes/models';
import type { DatabaseConnectionOptions } from '../../core/database';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { MethodCompilationService } from './methodCompilationService';

export const methodDocumentScheme = 'vc-ve-method';

export class MethodEditorProvider implements vscode.FileSystemProvider, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private readonly methods = new Map<string, MethodSource>();
	private readonly methodDatabases = new Map<string, DatabaseConnectionOptions>();
	private readonly sessionRevision = Date.now();
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Методы');
	private readonly diagnostics = vscode.languages.createDiagnosticCollection('Восточный Экспресс');
	private readonly compileRevisions = new Map<string, number>();
	readonly onDidChangeFile = this.changed.event;
	constructor(private readonly createMethod: (
		draft: ClassMethodDraft,
		target?: { database: string; host: string },
	) => Promise<CreatedClassMethod & { databaseOptions?: DatabaseConnectionOptions }>,
		private readonly compilation: MethodCompilationService,
	) {}

	async open(id: number, databaseOptions?: DatabaseConnectionOptions): Promise<void> {
		this.log(`Открытие метода ID=${id}.`);
		const method = await getMethodSource(id, databaseOptions);
		this.log(`Код получен из БД: type=${method.codeType}; ${inspectText(method.code)}.`);
		const uri = await this.getUri(method, databaseOptions);
		const extension = method.methodType === 3 ? 'pkf' : 'pas';
		const languageId = extension === 'pkf' ? 've-pkf' : 've-pascal';
		await ensureWindows1251(languageId);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, languageId);
		this.log(`Документ открыт: language=${document.languageId}; ${inspectText(document.getText())}.`);
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
	}
	async getMethod(uri: vscode.Uri): Promise<MethodSource> { return this.ensureMethod(uri); }
	async save(id: number, code: string): Promise<{ id: number; name: string; changed: boolean }> {
		const method = await getMethodSource(id);
		const changed = method.code !== code;
		await this.persistMethod(method, code);
		return { id: method.id, name: method.name, changed };
	}
	async create(draft: ClassMethodDraft, target?: { database: string; host: string }): Promise<CreatedClassMethod> {
		const created = await this.createMethod(draft, target);
		await this.open(created.id, created.databaseOptions);
		return created;
	}
	async getUri(methodOrId: MethodSource | number, databaseOptions?: DatabaseConnectionOptions): Promise<vscode.Uri> {
		const method = typeof methodOrId === 'number' ? await getMethodSource(methodOrId, databaseOptions) : methodOrId;
		const extension = method.methodType === 3 ? 'pkf' : 'pas';
		const uri = vscode.Uri.from({ scheme: methodDocumentScheme, path: `/${safeName(method.name)}-${method.id}.${extension}`, query: `id=${method.id}&revision=${this.sessionRevision}` });
		this.methods.set(uri.toString(), method);
		if (databaseOptions) { this.methodDatabases.set(uri.toString(), databaseOptions); }
		return uri;
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
		await this.persistMethod(method, code, uri, this.methodDatabases.get(uri.toString()));
	}
	delete(): void { throw vscode.FileSystemError.NoPermissions('Удаление метода из редактора запрещено.'); }
	rename(): void { throw vscode.FileSystemError.NoPermissions('Переименование метода из редактора запрещено.'); }
	dispose(): void { this.changed.dispose(); this.methods.clear(); this.methodDatabases.clear(); this.compileRevisions.clear(); this.diagnostics.dispose(); this.output.dispose(); }

	private async persistMethod(method: MethodSource, code: string, sourceUri?: vscode.Uri, databaseOptions?: DatabaseConnectionOptions): Promise<void> {
		try {
			await saveMethodSource(method, code, message => this.log(`[repository] ${message}`), databaseOptions);
		} catch (error) {
			this.log(`writeFile завершился ошибкой: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
			this.output.show(true);
			throw error;
		}
		this.log(`writeFile успешно завершён ID=${method.id}.`);
		for (const [uri, cached] of this.methods) {
			if (cached.id !== method.id) {
				continue;
			}
			cached.code = code;
			this.changed.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse(uri) }]);
		}
		if (sourceUri && !this.methods.has(sourceUri.toString())) {
			this.changed.fire([{ type: vscode.FileChangeType.Changed, uri: sourceUri }]);
		}
		vscode.window.setStatusBarMessage(`Метод ${method.name} сохранён в Windows-1251`, 2500);
		if (sourceUri) { void this.compile(method, sourceUri, databaseOptions); }
	}

	private async compile(method: MethodSource, uri: vscode.Uri, databaseOptions?: DatabaseConnectionOptions): Promise<void> {
		const key = uri.toString();
		const revision = (this.compileRevisions.get(key) ?? 0) + 1;
		this.compileRevisions.set(key, revision);
		this.diagnostics.delete(uri);
		try {
			const options = databaseOptions ?? await getProjectDatabaseOptions();
			this.log(`Компиляция ID=${method.id} в базе ${options.database}.`);
			const result = await this.compilation.check(method.id, options.database, options.host, 'editor');
			if (this.compileRevisions.get(key) !== revision) { return; }
			if (result.status === 'failed') { throw new Error(result.error ?? 'Компиляция не выполнена.'); }
			const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === key);
			const diagnostics = result.diagnostics.map(item => {
				const line = Math.min(Math.max(0, item.line - 1), Math.max(0, (document?.lineCount ?? 1) - 1));
				const end = document?.lineAt(line).range.end ?? new vscode.Position(line, 1);
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(new vscode.Position(line, 0), end),
					item.message,
					item.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
				);
				diagnostic.source = 'Компилятор Восточного Экспресса';
				return diagnostic;
			});
			this.diagnostics.set(uri, diagnostics);
			for (const item of result.diagnostics) {
				this.log(`${item.severity === 'error' ? 'Ошибка' : 'Предупреждение'} ID=${method.id}, строка ${item.line}: ${item.message}`);
			}
			this.log(diagnostics.length ? `Компиляция ID=${method.id}: диагностик ${diagnostics.length}.` : `Компиляция ID=${method.id}: ошибок нет.`);
		} catch (error) {
			if (this.compileRevisions.get(key) !== revision) { return; }
			this.log(`Компиляция ID=${method.id} не выполнена: ${error instanceof Error ? error.message : String(error)}`);
			void vscode.window.showWarningMessage(`Метод сохранён, но компиляция не выполнена: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

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
		const method = await getMethodSource(id, this.methodDatabases.get(uri.toString()));
		this.methods.set(uri.toString(), method);
		return method;
	}
}

export function registerMethodEditor(
	context: vscode.ExtensionContext,
	createMethod: (draft: ClassMethodDraft, target?: { database: string; host: string }) => Promise<CreatedClassMethod & { databaseOptions?: DatabaseConnectionOptions }>,
	compilation: MethodCompilationService,
): MethodEditorProvider {
	const provider = new MethodEditorProvider(createMethod, compilation);
	context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(methodDocumentScheme, provider, { isCaseSensitive: true }));
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
