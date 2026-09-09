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
exports.registerMethodLanguageFeatures = registerMethodLanguageFeatures;
const vscode = __importStar(require("vscode"));
const classRepository_1 = require("../../infrastructure/database/classRepository");
const methodRepository_1 = require("../../infrastructure/database/methodRepository");
const methodEditorProvider_1 = require("./methodEditorProvider");
const selector = [
    { scheme: methodEditorProvider_1.methodDocumentScheme, language: 've-pkf' },
    { scheme: methodEditorProvider_1.methodDocumentScheme, language: 've-pascal' },
];
function registerMethodLanguageFeatures(context, methodEditor, openClass) {
    const symbols = new MethodSymbolIndex(methodEditor);
    const diagnostics = new LanguageFeatureDiagnostics(context);
    context.subscriptions.push(diagnostics, vscode.languages.registerCompletionItemProvider(selector, {
        provideCompletionItems: document => diagnostics.run('Автодополнение', document, undefined, [], () => symbols.completions(document)),
    }, '.', ':'), vscode.languages.registerSignatureHelpProvider(selector, {
        provideSignatureHelp: (document, position) => diagnostics.run('Подсказка параметров', document, position, undefined, () => symbols.signatureHelp(document, position)),
    }, '(', ','), vscode.languages.registerDefinitionProvider(selector, {
        provideDefinition: (document, position) => diagnostics.run('Переход к определению', document, position, undefined, async () => {
            const range = document.getWordRangeAtPosition(position, /[\p{L}_][\p{L}\p{N}_]*/u);
            if (!range) {
                return undefined;
            }
            const definition = await symbols.definition(document, document.getText(range));
            if (definition?.kind === 'class') {
                await openClass(definition.id);
                return [];
            }
            if (definition?.kind === 'method') {
                return new vscode.Location(await methodEditor.getUri(Number(definition.method.id)), new vscode.Position(0, 0));
            }
            return undefined;
        }),
    }));
}
class LanguageFeatureDiagnostics {
    context;
    output = vscode.window.createOutputChannel('Восточный Экспресс: Интеллект кода');
    lastNotification = '';
    lastNotificationAt = 0;
    constructor(context) {
        this.context = context;
        this.output.appendLine(`[${new Date().toISOString()}] Интеллект кода запущен; версия расширения ${String(context.extension.packageJSON.version ?? 'неизвестна')}.`);
    }
    async run(operation, document, position, fallback, action) {
        try {
            return await action();
        }
        catch (error) {
            this.report(operation, document, position, error);
            return fallback;
        }
    }
    dispose() {
        this.output.dispose();
    }
    report(operation, document, position, error) {
        const timestamp = new Date().toISOString();
        const location = position ? `${position.line + 1}:${position.character + 1}` : 'нет';
        const errorText = error instanceof Error ? error.stack ?? error.message : String(error);
        const methodId = new URLSearchParams(document.uri.query).get('id') ?? 'неизвестен';
        this.output.appendLine('');
        this.output.appendLine(`[${timestamp}] ОШИБКА: ${operation}`);
        this.output.appendLine(`Документ: ${document.uri.toString()}`);
        this.output.appendLine(`Метод ID: ${methodId}; язык: ${document.languageId}; позиция: ${location}`);
        this.output.appendLine(errorText);
        const notificationKey = `${operation}:${error instanceof Error ? error.message : String(error)}`;
        const now = Date.now();
        if (notificationKey === this.lastNotification && now - this.lastNotificationAt < 5000) {
            return;
        }
        this.lastNotification = notificationKey;
        this.lastNotificationAt = now;
        void vscode.window.showErrorMessage(`Ошибка функции «${operation}». Подробности записаны в журнал «Интеллект кода».`, 'Открыть журнал').then(selection => {
            if (selection === 'Открыть журнал') {
                this.output.show(true);
            }
        });
    }
}
class MethodSymbolIndex {
    editor;
    classSymbols = new Map();
    classes;
    constructor(editor) {
        this.editor = editor;
    }
    async completions(document) {
        const current = await this.forDocument(document);
        const classes = await this.allClasses();
        return [
            ...current.attributes.map(attribute => completion(attribute.name, vscode.CompletionItemKind.Field, attribute.type, attribute.owner)),
            ...current.methods.map(method => methodCompletion(method)),
            ...classes.map(item => completion(item.name, vscode.CompletionItemKind.Class, `Класс · ID ${item.id}`)),
        ];
    }
    async signatureHelp(document, position) {
        const call = findCall(document.getText(new vscode.Range(new vscode.Position(0, 0), position)));
        if (!call) {
            return undefined;
        }
        const current = await this.forDocument(document);
        const method = current.methods.find(item => sameName(item.name, call.name));
        if (!method) {
            return undefined;
        }
        const label = method.signature.trim() || `${method.name}(…)`;
        const help = new vscode.SignatureHelp();
        const information = new vscode.SignatureInformation(label, `${method.type}${method.owner ? ` · ${method.owner}` : ''}`);
        information.parameters = parseParameters(label).map(parameter => new vscode.ParameterInformation(parameter));
        help.signatures = [information];
        help.activeSignature = 0;
        help.activeParameter = Math.min(call.parameter, Math.max(0, information.parameters.length - 1));
        return help;
    }
    async definition(document, word) {
        const current = await this.forDocument(document);
        const method = current.methods.find(item => sameName(item.name, word));
        if (method) {
            return { kind: 'method', method };
        }
        const targetClass = (await this.allClasses()).find(item => sameName(item.name, word));
        if (targetClass) {
            return { kind: 'class', id: targetClass.id };
        }
        const externalMethod = (await (0, methodRepository_1.findMethodsByName)(word))[0];
        return externalMethod
            ? { kind: 'method', method: { ...externalMethod, id: String(externalMethod.id), owner: '', signature: '', type: '', visibility: '', package: '', line: '', updatedAt: '', createdBy: '', inherited: false } }
            : undefined;
    }
    async forDocument(document) {
        const method = await this.editor.getMethod(document.uri);
        let cached = this.classSymbols.get(method.seniorId);
        if (!cached) {
            cached = (async () => {
                const details = await (0, classRepository_1.getClassDetails)(method.seniorId);
                const [attributes, methods] = await Promise.all([
                    (0, classRepository_1.getClassAttributes)(details.id, details.name, true),
                    (0, classRepository_1.getClassMethods)(details.id, details.name, true),
                ]);
                return { className: details.name, attributes, methods };
            })();
            this.classSymbols.set(method.seniorId, cached);
            cached.catch(() => this.classSymbols.delete(method.seniorId));
        }
        return cached;
    }
    allClasses() {
        this.classes ??= (0, classRepository_1.loadClasses)();
        this.classes.catch(() => { this.classes = undefined; });
        return this.classes;
    }
}
function completion(label, kind, detail, description) {
    const item = new vscode.CompletionItem(label, kind);
    item.detail = [detail, description].filter(Boolean).join(' · ');
    return item;
}
function methodCompletion(method) {
    const item = completion(method.name, vscode.CompletionItemKind.Method, method.signature || method.type, method.owner);
    const parameters = parseParameters(method.signature);
    item.insertText = parameters.length
        ? new vscode.SnippetString(`${method.name}(${parameters.map((parameter, index) => `\${${index + 1}:${snippetName(parameter)}}`).join(', ')})`)
        : method.name;
    item.command = { command: 'editor.action.triggerParameterHints', title: 'Показать параметры' };
    return item;
}
function parseParameters(signature) {
    const body = signature.match(/\(([^)]*)\)/)?.[1]?.trim();
    return body ? body.split(/[;,]/).map(value => value.trim()).filter(Boolean) : [];
}
function snippetName(parameter) {
    return (parameter.split(/[:=\s]/)[0] || 'параметр').replace(/[}$\\]/g, '');
}
function findCall(text) {
    let depth = 0;
    let commas = 0;
    for (let index = text.length - 1; index >= 0; index--) {
        const character = text[index];
        if (character === ')') {
            depth++;
        }
        else if (character === '(') {
            if (depth > 0) {
                depth--;
                continue;
            }
            const name = text.slice(0, index).match(/([\p{L}_][\p{L}\p{N}_]*)\s*$/u)?.[1];
            return name ? { name, parameter: commas } : undefined;
        }
        else if (character === ',' && depth === 0) {
            commas++;
        }
    }
    return undefined;
}
function sameName(left, right) {
    return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0;
}
//# sourceMappingURL=methodLanguageFeatures.js.map