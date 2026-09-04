import * as vscode from 'vscode';
import { getClassAttributes } from '../../infrastructure/database/classRepository';
import type { ClassAttribute } from '../classes/models';
import type { DfmEditorProvider } from './dfmEditorProvider';

const selector: vscode.DocumentSelector = [{ scheme: 'vc-ve-dfm', language: 've-dfm' }];

export function registerDfmLanguageFeatures(context: vscode.ExtensionContext, editor: DfmEditorProvider): void {
	const cache = new Map<number, Promise<ClassAttribute[]>>();
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
		provideCompletionItems: async (document, position) => {
			const source = await editor.getSource(document.uri);
			let attributes = cache.get(source.classId);
			if (!attributes) {
				attributes = getClassAttributes(source.classId, source.className, true);
				cache.set(source.classId, attributes);
				attributes.catch(() => cache.delete(source.classId));
			}
			const range = attributeRange(document, position);
			return (await attributes).map(attribute => attributeCompletion(attribute, range));
		},
	}, "'", '='));
}

function attributeCompletion(attribute: ClassAttribute, range: vscode.Range): vscode.CompletionItem {
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

function attributeRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range {
	const prefix = document.lineAt(position.line).text.slice(0, position.character);
	const token = prefix.match(/[\p{L}\p{N}_]*$/u)?.[0] ?? '';
	return new vscode.Range(position.translate(0, -token.length), position);
}

function escapeMarkdown(value: string): string { return value.replace(/[\\`*_{}\[\]()<>#+.!|\-]/g, '\\$&'); }
