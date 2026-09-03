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
exports.registerCodeHistory = registerCodeHistory;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const methodHistoryRepository_1 = require("../../infrastructure/database/methodHistoryRepository");
const methodWorkingCopyRepository_1 = require("../../infrastructure/database/methodWorkingCopyRepository");
const methodRepository_1 = require("../../infrastructure/database/methodRepository");
const methodEditorProvider_1 = require("../methods/methodEditorProvider");
const svnClient_1 = require("./svnClient");
const historyScheme = 'vc-ve-history';
function registerCodeHistory(context, methodEditor) {
    const service = new CodeHistoryService(context.extensionUri, methodEditor);
    context.subscriptions.push(service, vscode.workspace.registerTextDocumentContentProvider(historyScheme, service), vscode.window.registerWebviewViewProvider(CodeHistoryService.viewType, service, { webviewOptions: { retainContextWhenHidden: true } }), vscode.commands.registerTextEditorCommand('vc-ve-tools.showCodeHistory', editor => service.show(editor, false)), vscode.commands.registerTextEditorCommand('vc-ve-tools.showSelectionHistory', editor => service.show(editor, true)), vscode.commands.registerCommand('vc-ve-tools.svnLocalDiff', (methodId) => service.showLocalDiff(methodId)), vscode.commands.registerCommand('vc-ve-tools.svnHistory', (methodId) => service.showWorkingCopyHistory(methodId)), vscode.commands.registerCommand('vc-ve-tools.svnBlame', (methodId) => service.showBlame(methodId)));
}
class CodeHistoryService {
    extensionUri;
    methodEditor;
    static viewType = 'vc-ve-tools.codeHistory';
    contents = new Map();
    actions = new Map();
    output = vscode.window.createOutputChannel('Восточный Экспресс: История кода');
    view;
    message = { command: 'codeHistoryLoaded', title: 'История кода', subtitle: '', entries: [] };
    sequence = 0;
    blameDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        before: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 1.5em 0 0' },
    });
    constructor(extensionUri, methodEditor) {
        this.extensionUri = extensionUri;
        this.methodEditor = methodEditor;
        this.log('Сервис истории кода запущен.');
    }
    resolveWebviewView(view) {
        this.view = view;
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        view.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
        view.webview.html = webviewHtml(view.webview, assetsRoot);
        view.webview.onDidReceiveMessage((message) => {
            if (!(0, webviewProtocol_1.isCodeHistoryWebviewMessage)(message)) {
                return;
            }
            if (message.command === 'codeHistoryReady') {
                void this.post(this.message);
                return;
            }
            const action = this.actions.get(message.id);
            if (action) {
                void action().catch(error => this.reportError('Открытие сравнения', vscode.Uri.parse(message.id), error));
            }
        });
    }
    provideTextDocumentContent(uri) { return this.contents.get(uri.toString()) ?? ''; }
    async show(editor, selectionOnly) {
        const operation = selectionOnly ? 'История выделенного кода' : 'История файла или метода';
        const title = selectionOnly ? 'История выделенного кода' : 'История кода';
        try {
            await vscode.commands.executeCommand('workbench.view.extension.vc-ve-tools-code-history');
            this.actions.clear();
            await this.setMessage({ command: 'codeHistoryLoading', title });
            this.log(`${operation}: ${editor.document.uri.toString()}; строки ${editor.selection.start.line + 1}-${editor.selection.end.line + 1}.`);
            if (editor.document.uri.scheme === methodEditorProvider_1.methodDocumentScheme) {
                await this.loadMethodHistory(editor, selectionOnly);
            }
            else if (editor.document.uri.scheme === 'file') {
                await this.loadSvnHistory(editor, selectionOnly);
            }
            else {
                throw new Error(`Схема документа ${editor.document.uri.scheme} не поддерживает историю кода.`);
            }
        }
        catch (error) {
            await this.setMessage({ command: 'codeHistoryFailed', title, message: errorMessage(error) });
            this.reportError(operation, editor.document.uri, error);
        }
    }
    async showLocalDiff(methodId) {
        await this.runSvnAction('Local Diff', methodId, async (fileName, id) => {
            const local = await vscode.workspace.openTextDocument(vscode.Uri.file(fileName));
            const stored = id === undefined ? await (0, svnClient_1.svnCatBase)(fileName) : (await (0, methodRepository_1.getMethodSource)(id)).code;
            await vscode.commands.executeCommand('vscode.diff', this.store(`${path.basename(fileName)} · ${id === undefined ? 'SVN BASE' : 'код из БД'}`, stored, path.extname(fileName)), local.uri, `${path.basename(fileName)} · Local Diff`, { preview: true });
        });
    }
    async showWorkingCopyHistory(methodId) {
        await this.runSvnAction('История SVN', methodId, async (fileName) => {
            await vscode.commands.executeCommand('workbench.view.extension.vc-ve-tools-code-history');
            this.actions.clear();
            await this.setMessage({ command: 'codeHistoryLoading', title: path.basename(fileName) });
            await this.loadSvnFileHistory(fileName, false);
        });
    }
    async showBlame(methodId) {
        await this.runSvnAction('SVN Blame', methodId, async (fileName) => {
            const [document, lines] = await Promise.all([vscode.workspace.openTextDocument(vscode.Uri.file(fileName)), (0, svnClient_1.svnBlame)(fileName)]);
            const editor = await vscode.window.showTextDocument(document, { preview: true });
            const width = Math.max(1, ...lines.map(line => String(line.revision).length));
            editor.setDecorations(this.blameDecoration, lines.filter(line => line.line <= document.lineCount).map(line => ({
                range: document.lineAt(line.line - 1).range,
                hoverMessage: `SVN r${line.revision} · ${line.author}${Number.isNaN(line.date.getTime()) ? '' : ` · ${formatDate(line.date)}`}`,
                renderOptions: { before: { contentText: `r${String(line.revision).padStart(width)}  ${line.author}` } },
            })));
        });
    }
    dispose() { this.contents.clear(); this.actions.clear(); this.blameDecoration.dispose(); this.output.dispose(); this.view = undefined; }
    async loadSvnHistory(editor, selectionOnly) {
        const fileName = editor.document.uri.fsPath;
        await this.loadSvnFileHistory(fileName, selectionOnly, editor);
    }
    async loadSvnFileHistory(fileName, selectionOnly, editor) {
        const allEntries = await (0, svnClient_1.svnLog)(fileName);
        let entries = allEntries;
        if (selectionOnly) {
            if (!editor || editor.selection.isEmpty) {
                throw new Error('Сначала выделите строки, историю которых нужно посмотреть.');
            }
            const startLine = editor.selection.start.line + 1;
            const endLine = editor.selection.end.line + (editor.selection.end.character === 0 ? 0 : 1);
            const revisions = await (0, svnClient_1.svnBlameRevisions)(fileName, startLine, Math.max(startLine, endLine));
            entries = allEntries.filter(entry => revisions.has(entry.revision));
        }
        const list = entries.map(entry => {
            const id = `svn:${entry.revision}`;
            this.actions.set(id, async () => {
                const index = allEntries.findIndex(item => item.revision === entry.revision);
                const previousRevision = allEntries[index + 1]?.revision ?? entry.revision - 1;
                const [before, after] = await Promise.all([(0, svnClient_1.svnCat)(fileName, previousRevision).catch(() => ''), (0, svnClient_1.svnCat)(fileName, entry.revision)]);
                await this.openDiff(`${path.basename(fileName)} · r${previousRevision}`, before, `${path.basename(fileName)} · r${entry.revision}`, after, path.extname(fileName), `SVN r${entry.revision}: ${firstLine(entry.message) || 'без комментария'}`);
            });
            return {
                id,
                kind: 'svn',
                date: formatDate(entry.date),
                timestamp: entry.date.getTime(),
                user: entry.author,
                computer: '',
                commit: `r${entry.revision}`,
                commitOrder: entry.revision,
                comment: firstLine(entry.message) || 'Без комментария',
            };
        });
        await this.setMessage({ command: 'codeHistoryLoaded', title: selectionOnly ? 'Ревизии выделенных строк' : path.basename(fileName), subtitle: `${list.length} ${pluralChanges(list.length)} · SVN`, entries: list });
    }
    async runSvnAction(operation, methodId, action) {
        let uri = vscode.window.activeTextEditor?.document.uri;
        try {
            const resolvedId = Number.isSafeInteger(methodId) ? methodId : uri?.scheme === methodEditorProvider_1.methodDocumentScheme ? (await this.methodEditor.getMethod(uri)).id : undefined;
            const fileName = resolvedId === undefined ? uri?.scheme === 'file' ? uri.fsPath : undefined : await this.resolveWorkingCopy(resolvedId);
            if (!fileName) {
                throw new Error('Откройте локальный файл или метод из базы данных.');
            }
            uri = vscode.Uri.file(fileName);
            this.log(`${operation}: ${fileName}${resolvedId === undefined ? '' : `; метод ${resolvedId}`}.`);
            await action(fileName, resolvedId);
        }
        catch (error) {
            this.reportError(operation, uri ?? vscode.Uri.parse('svn:/'), error);
        }
    }
    async resolveWorkingCopy(methodId) {
        const info = await (0, methodWorkingCopyRepository_1.getMethodWorkingCopyInfo)(methodId);
        const suffix = info.relativePath.replace(/\\/g, '/').toLocaleLowerCase('en-US');
        const candidates = await vscode.workspace.findFiles(`**/${escapeGlob(info.fileName)}`, '**/{node_modules,.git}/**', 100);
        const selected = candidates.find(candidate => candidate.path.toLocaleLowerCase('en-US').endsWith(suffix)) ?? (candidates.length === 1 ? candidates[0] : undefined);
        if (!selected) {
            throw new Error(candidates.length ? `Найдено несколько файлов ${info.fileName}, но путь ${info.relativePath} не совпал.` : `Локальный файл ${info.relativePath} не найден в рабочей области.`);
        }
        return selected.fsPath;
    }
    async loadMethodHistory(editor, selectionOnly) {
        const method = await this.methodEditor.getMethod(editor.document.uri);
        const allEntries = await (0, methodHistoryRepository_1.getMethodHistory)(method.id);
        let entries = allEntries;
        if (selectionOnly) {
            if (editor.selection.isEmpty) {
                throw new Error('Сначала выделите код, историю которого нужно посмотреть.');
            }
            const selectedText = editor.document.getText(editor.selection).trim();
            const matching = selectedText ? allEntries.filter(entry => entry.oldCode.includes(selectedText) || entry.newCode.includes(selectedText)) : [];
            if (matching.length) {
                entries = matching;
            }
        }
        const extension = path.extname(editor.document.uri.path) || '.pas';
        const list = entries.map((entry, index) => {
            const id = `database:${entry.revision}:${index}`;
            this.actions.set(id, () => this.openDiff(`${method.name} · до ${formatDate(entry.changedAt)}`, entry.oldCode, `${method.name} · после ${formatDate(entry.changedAt)}`, entry.newCode, extension, `История метода ${method.name} · ${formatDate(entry.changedAt)}`));
            return {
                id,
                kind: 'database',
                date: formatDate(entry.changedAt),
                timestamp: entry.changedAt.getTime(),
                user: formatUser(entry),
                computer: entry.computerName,
                commit: entry.revision || 'БД',
                commitOrder: Number(entry.revision) || entry.changedAt.getTime() || index,
                comment: firstLine(entry.comment) || (entry.revision ? `Запись аудита ${entry.revision}` : 'Изменение кода'),
            };
        });
        await this.setMessage({ command: 'codeHistoryLoaded', title: method.name, subtitle: `${list.length} ${pluralChanges(list.length)} · база данных · ID ${method.id}`, entries: list });
    }
    async openDiff(leftLabel, left, rightLabel, right, extension, title) {
        await vscode.commands.executeCommand('vscode.diff', this.store(leftLabel, left, extension), this.store(rightLabel, right, extension), title, { preview: true });
    }
    store(label, content, extension) {
        const safeLabel = label.replace(/[\\/:*?"<>|]/g, '_');
        const uri = vscode.Uri.from({ scheme: historyScheme, path: `/${safeLabel}${extension}`, query: `view=${++this.sequence}` });
        this.contents.set(uri.toString(), content);
        return uri;
    }
    async setMessage(message) { this.message = message; await this.post(message); }
    async post(message) { await this.view?.webview.postMessage(message); }
    reportError(operation, uri, error) {
        this.log(`ОШИБКА · ${operation}\nДокумент: ${uri.toString()}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        void vscode.window.showErrorMessage(`Не удалось выполнить «${operation}». Подробности записаны в журнал «История кода».`, 'Открыть журнал').then(selection => {
            if (selection === 'Открыть журнал') {
                this.output.show(true);
            }
        });
    }
    log(message) { this.output.appendLine(`[${new Date().toISOString()}] ${message}`); }
}
function webviewHtml(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'code-history.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'code-history.css'));
    const nonce = Math.random().toString(36).slice(2);
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>История кода</title></head><body><div id="app"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
function formatDate(value) { return Number.isNaN(value.getTime()) ? 'дата неизвестна' : value.toLocaleString('ru-RU'); }
function firstLine(value) { return value.trim().split(/\r?\n/, 1)[0] ?? ''; }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function formatUser(entry) {
    if (entry.userName && entry.loginName && entry.userName !== entry.loginName) {
        return `${entry.userName} (${entry.loginName})`;
    }
    return entry.userName || entry.loginName || `пользователь ${entry.userId}`;
}
function pluralChanges(count) { return count % 10 === 1 && count % 100 !== 11 ? 'изменение' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'изменения' : 'изменений'; }
function escapeGlob(value) { return value.replace(/[{}[\]*?]/g, character => `[${character}]`); }
//# sourceMappingURL=codeHistoryService.js.map