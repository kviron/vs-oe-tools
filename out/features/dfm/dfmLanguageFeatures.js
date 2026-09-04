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
exports.registerDfmLanguageFeatures = registerDfmLanguageFeatures;
const vscode = __importStar(require("vscode"));
const classRepository_1 = require("../../infrastructure/database/classRepository");
const selector = [{ scheme: 'vc-ve-dfm', language: 've-dfm' }];
function registerDfmLanguageFeatures(context, editor) {
    const cache = new Map();
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
        provideCompletionItems: async (document, position) => {
            const source = await editor.getSource(document.uri);
            let attributes = cache.get(source.classId);
            if (!attributes) {
                attributes = (0, classRepository_1.getClassAttributes)(source.classId, source.className, true);
                cache.set(source.classId, attributes);
                attributes.catch(() => cache.delete(source.classId));
            }
            const range = attributeRange(document, position);
            return (await attributes).map(attribute => attributeCompletion(attribute, range));
        },
    }, "'", '='));
}
function attributeCompletion(attribute, range) {
    const item = new vscode.CompletionItem(attribute.name, vscode.CompletionItemKind.Field);
    item.range = range;
    item.insertText = attribute.name;
    item.detail = [attribute.type, attribute.inherited ? `унаследован от ${attribute.owner}` : 'атрибут текущего класса', `ID ${attribute.id}`]
        .filter(Boolean).join(' · ');
    item.documentation = new vscode.MarkdownString([
        `**${escapeMarkdown(attribute.name)}**`,
        attribute.owner ? `Класс: ${escapeMarkdown(attribute.owner)}` : '',
        attribute.type ? `Тип: ${escapeMarkdown(attribute.type)}` : '',
        `ID: ${escapeMarkdown(attribute.id)}`,
    ].filter(Boolean).join('  \n'));
    item.sortText = `${attribute.inherited ? '1' : '0'}-${attribute.name.toLocaleLowerCase('ru')}`;
    return item;
}
function attributeRange(document, position) {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const token = prefix.match(/[\p{L}\p{N}_]*$/u)?.[0] ?? '';
    return new vscode.Range(position.translate(0, -token.length), position);
}
function escapeMarkdown(value) { return value.replace(/[\\`*_{}\[\]()<>#+.!|\-]/g, '\\$&'); }
//# sourceMappingURL=dfmLanguageFeatures.js.map