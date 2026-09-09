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
exports.DfmEditorProvider = void 0;
exports.registerDfmEditor = registerDfmEditor;
const vscode = __importStar(require("vscode"));
const iconv = __importStar(require("iconv-lite"));
const dfmRepository_1 = require("./dfmRepository");
const scheme = 'vc-ve-dfm';
class DfmEditorProvider {
    changed = new vscode.EventEmitter();
    sources = new Map();
    sessionRevision = Date.now();
    onDidChangeFile = this.changed.event;
    async getSource(uri) { return this.ensure(uri); }
    async open(classId) {
        const source = await (0, dfmRepository_1.getDfmSource)(classId);
        await ensureWindows1251();
        const uri = vscode.Uri.from({ scheme, path: `/${safeName(source.className)}-${classId}.dfm`, query: `classId=${classId}&revision=${this.sessionRevision}` });
        this.sources.set(uri.toString(), source);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(document, 've-dfm');
        await vscode.window.showTextDocument(document, { preview: false });
    }
    watch() { return new vscode.Disposable(() => undefined); }
    async stat(uri) { const source = await this.ensure(uri); return { type: vscode.FileType.File, ctime: 0, mtime: Date.now(), size: iconv.encode(source.text, 'win1251').byteLength }; }
    readDirectory() { return []; }
    createDirectory() { throw vscode.FileSystemError.NoPermissions(); }
    async readFile(uri) { return iconv.encode((await this.ensure(uri)).text, 'win1251'); }
    async writeFile(uri, content) {
        const source = await this.ensure(uri);
        const saved = await (0, dfmRepository_1.saveDfmSource)(source, iconv.decode(Buffer.from(content), 'win1251'));
        this.sources.set(uri.toString(), saved);
        this.changed.fire([{ type: vscode.FileChangeType.Changed, uri }]);
        vscode.window.setStatusBarMessage(`DFM ${source.className} сохранён`, 2500);
    }
    delete() { throw vscode.FileSystemError.NoPermissions(); }
    rename() { throw vscode.FileSystemError.NoPermissions(); }
    dispose() { this.changed.dispose(); this.sources.clear(); }
    async ensure(uri) {
        const cached = this.sources.get(uri.toString());
        if (cached)
            return cached;
        const id = Number(new URLSearchParams(uri.query).get('classId'));
        if (!Number.isSafeInteger(id))
            throw vscode.FileSystemError.FileNotFound(uri);
        const source = await (0, dfmRepository_1.getDfmSource)(id);
        this.sources.set(uri.toString(), source);
        return source;
    }
}
exports.DfmEditorProvider = DfmEditorProvider;
function registerDfmEditor(context) {
    const provider = new DfmEditorProvider();
    context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(scheme, provider, { isCaseSensitive: true }));
    return provider;
}
function safeName(value) { return value.replace(/[\\/:*?"<>|]/g, '_') || 'dialog'; }
async function ensureWindows1251() {
    const configuration = vscode.workspace.getConfiguration('files', { languageId: 've-dfm' });
    if (configuration.get('encoding') === 'windows1251') {
        return;
    }
    await configuration.update('encoding', 'windows1251', vscode.ConfigurationTarget.Workspace, true);
}
//# sourceMappingURL=dfmEditorProvider.js.map