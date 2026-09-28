"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MethodEditorProvider = exports.methodDocumentScheme = void 0;
exports.registerMethodEditor = registerMethodEditor;
const vscode = __importStar(require("vscode"));
const iconv = __importStar(require("iconv-lite"));
const methodRepository_1 = require("../../infrastructure/database/methodRepository");
const projectDatabaseOptions_1 = require("../../infrastructure/configuration/projectDatabaseOptions");
exports.methodDocumentScheme = 'vc-ve-method';
class MethodEditorProvider {
    createMethod;
    compilation;
    changed = new vscode.EventEmitter();
    methods = new Map();
    methodDatabases = new Map();
    sessionRevision = Date.now();
    output = vscode.window.createOutputChannel('Восточный Экспресс: Методы');
    diagnostics = vscode.languages.createDiagnosticCollection('Восточный Экспресс');
    compileRevisions = new Map();
    onDidChangeFile = this.changed.event;
    constructor(createMethod, compilation) {
        this.createMethod = createMethod;
        this.compilation = compilation;
    }
    async open(id, databaseOptions) {
        this.log(`Открытие метода ID=${id}.`);
        const method = await (0, methodRepository_1.getMethodSource)(id, databaseOptions);
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
    async getMethod(uri) { return this.ensureMethod(uri); }
    async save(id, code) {
        const method = await (0, methodRepository_1.getMethodSource)(id);
        const changed = method.code !== code;
        await this.persistMethod(method, code);
        return { id: method.id, name: method.name, changed };
    }
    async create(draft, target) {
        const created = await this.createMethod(draft, target);
        await this.open(created.id, created.databaseOptions);
        return created;
    }
    async getUri(methodOrId, databaseOptions) {
        const method = typeof methodOrId === 'number' ? await (0, methodRepository_1.getMethodSource)(methodOrId, databaseOptions) : methodOrId;
        const extension = method.methodType === 3 ? 'pkf' : 'pas';
        const uri = vscode.Uri.from({ scheme: exports.methodDocumentScheme, path: `/${safeName(method.name)}-${method.id}.${extension}`, query: `id=${method.id}&revision=${this.sessionRevision}` });
        this.methods.set(uri.toString(), method);
        if (databaseOptions) {
            this.methodDatabases.set(uri.toString(), databaseOptions);
        }
        return uri;
    }
    watch() { return new vscode.Disposable(() => undefined); }
    async stat(uri) {
        await this.ensureMethod(uri);
        return { type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: iconv.encode(this.methods.get(uri.toString())?.code ?? '', 'win1251').byteLength };
    }
    readDirectory() { return []; }
    createDirectory() { throw vscode.FileSystemError.NoPermissions('Виртуальная папка методов доступна только для чтения.'); }
    async readFile(uri) {
        const method = await this.ensureMethod(uri);
        const bytes = iconv.encode(method.code, 'win1251');
        this.log(`readFile ID=${method.id}: bytes=${bytes.byteLength}; source ${inspectText(method.code)}; decoded ${inspectText(iconv.decode(bytes, 'win1251'))}.`);
        return bytes;
    }
    async writeFile(uri, content) {
        const method = await this.ensureMethod(uri);
        const code = iconv.decode(Buffer.from(content), 'win1251');
        this.log(`writeFile вызван ID=${method.id}: bytes=${content.byteLength}; decoded ${inspectText(code)}.`);
        await this.persistMethod(method, code, uri, this.methodDatabases.get(uri.toString()));
    }
    delete() { throw vscode.FileSystemError.NoPermissions('Удаление метода из редактора запрещено.'); }
    rename() { throw vscode.FileSystemError.NoPermissions('Переименование метода из редактора запрещено.'); }
    dispose() { this.changed.dispose(); this.methods.clear(); this.methodDatabases.clear(); this.compileRevisions.clear(); this.diagnostics.dispose(); this.output.dispose(); }
    async persistMethod(method, code, sourceUri, databaseOptions) {
        try {
            await (0, methodRepository_1.saveMethodSource)(method, code, message => this.log(`[repository] ${message}`), databaseOptions);
        }
        catch (error) {
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
        if (sourceUri) {
            void this.compile(method, sourceUri, databaseOptions);
        }
    }
    async compile(method, uri, databaseOptions) {
        const key = uri.toString();
        const revision = (this.compileRevisions.get(key) ?? 0) + 1;
        this.compileRevisions.set(key, revision);
        this.diagnostics.delete(uri);
        try {
            const options = databaseOptions ?? await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
            this.log(`Компиляция ID=${method.id} в базе ${options.database}.`);
            const result = await this.compilation.check(method.id, options.database, options.host, 'editor');
            if (this.compileRevisions.get(key) !== revision) {
                return;
            }
            if (result.status === 'failed') {
                throw new Error(result.error ?? 'Компиляция не выполнена.');
            }
            const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === key);
            const diagnostics = result.diagnostics.map(item => {
                const line = Math.min(Math.max(0, item.line - 1), Math.max(0, (document?.lineCount ?? 1) - 1));
                const end = document?.lineAt(line).range.end ?? new vscode.Position(line, 1);
                const diagnostic = new vscode.Diagnostic(new vscode.Range(new vscode.Position(line, 0), end), item.message, item.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
                diagnostic.source = 'Компилятор Восточного Экспресса';
                return diagnostic;
            });
            this.diagnostics.set(uri, diagnostics);
            for (const item of result.diagnostics) {
                this.log(`${item.severity === 'error' ? 'Ошибка' : 'Предупреждение'} ID=${method.id}, строка ${item.line}: ${item.message}`);
            }
            this.log(diagnostics.length ? `Компиляция ID=${method.id}: диагностик ${diagnostics.length}.` : `Компиляция ID=${method.id}: ошибок нет.`);
        }
        catch (error) {
            if (this.compileRevisions.get(key) !== revision) {
                return;
            }
            this.log(`Компиляция ID=${method.id} не выполнена: ${error instanceof Error ? error.message : String(error)}`);
            void vscode.window.showWarningMessage(`Метод сохранён, но компиляция не выполнена: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    log(message) {
        this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
    async ensureMethod(uri) {
        const cached = this.methods.get(uri.toString());
        if (cached) {
            return cached;
        }
        const id = Number(new URLSearchParams(uri.query).get('id'));
        if (!Number.isSafeInteger(id)) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        const method = await (0, methodRepository_1.getMethodSource)(id, this.methodDatabases.get(uri.toString()));
        this.methods.set(uri.toString(), method);
        return method;
    }
}
exports.MethodEditorProvider = MethodEditorProvider;
function registerMethodEditor(context, createMethod, compilation) {
    const provider = new MethodEditorProvider(createMethod, compilation);
    context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(exports.methodDocumentScheme, provider, { isCaseSensitive: true }));
    return provider;
}
function safeName(value) { return value.replace(/[\\/:*?"<>|]/g, '_') || 'method'; }
async function ensureWindows1251(languageId) {
    const configuration = vscode.workspace.getConfiguration('files', { languageId });
    if (configuration.get('encoding') === 'windows1251') {
        return;
    }
    await configuration.update('encoding', 'windows1251', vscode.ConfigurationTarget.Workspace, true);
}
function inspectText(value) {
    const replacementPositions = [];
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
//# sourceMappingURL=methodEditorProvider.js.map