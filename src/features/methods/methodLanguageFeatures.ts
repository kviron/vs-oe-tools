import * as vscode from 'vscode';
import { getClassAttributes, getClassDetails, getClassMethods, loadClasses } from '../../infrastructure/database/classRepository';
import type { ClassAttribute, ClassMethod, ClassTreeRow } from '../classes/models';
import { findMethodsByName } from '../../infrastructure/database/methodRepository';
import { methodDocumentScheme, type MethodEditorProvider } from './methodEditorProvider';

interface ClassSymbols {
	className: string;
	attributes: ClassAttribute[];
	methods: ClassMethod[];
}

const selector: vscode.DocumentSelector = [
	{ scheme: methodDocumentScheme, language: 've-pkf' },
	{ scheme: methodDocumentScheme, language: 've-pascal' },
];

export function registerMethodLanguageFeatures(
	context: vscode.ExtensionContext,
	methodEditor: MethodEditorProvider,
	openClass: (id: number) => Promise<void>,
): void {
	const symbols = new MethodSymbolIndex(methodEditor);
	const diagnostics = new LanguageFeatureDiagnostics(context);
	context.subscriptions.push(
		diagnostics,
		vscode.languages.registerCompletionItemProvider(selector, {
			provideCompletionItems: document => diagnostics.run(
				'Автодополнение', document, undefined, [], () => symbols.completions(document),
			),
		}, '.', ':'),
		vscode.languages.registerSignatureHelpProvider(selector, {
			provideSignatureHelp: (document, position) => diagnostics.run(
				'Подсказка параметров', document, position, undefined, () => symbols.signatureHelp(document, position),
			),
		}, '(', ','),
		vscode.languages.registerDefinitionProvider(selector, {
			provideDefinition: (document, position) => diagnostics.run(
				'Переход к определению', document, position, undefined, async () => {
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
		}),
	);
}

class LanguageFeatureDiagnostics implements vscode.Disposable {
	private readonly output = vscode.window.createOutputChannel('Восточный Экспресс: Интеллект кода');
	private lastNotification = '';
	private lastNotificationAt = 0;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.output.appendLine(`[${new Date().toISOString()}] Интеллект кода запущен; версия расширения ${String(context.extension.packageJSON.version ?? 'неизвестна')}.`);
	}

	async run<T>(
		operation: string,
		document: vscode.TextDocument,
		position: vscode.Position | undefined,
		fallback: T,
		action: () => Promise<T>,
	): Promise<T> {
		try {
			return await action();
		} catch (error) {
			this.report(operation, document, position, error);
			return fallback;
		}
	}

	dispose(): void {
		this.output.dispose();
	}

	private report(operation: string, document: vscode.TextDocument, position: vscode.Position | undefined, error: unknown): void {
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
		void vscode.window.showErrorMessage(
			`Ошибка функции «${operation}». Подробности записаны в журнал «Интеллект кода».`,
			'Открыть журнал',
		).then(selection => {
			if (selection === 'Открыть журнал') {
				this.output.show(true);
			}
		});
	}
}

class MethodSymbolIndex {
	private readonly classSymbols = new Map<number, Promise<ClassSymbols>>();
	private classes?: Promise<ClassTreeRow[]>;

	constructor(private readonly editor: MethodEditorProvider) {}

	async completions(document: vscode.TextDocument): Promise<vscode.CompletionItem[]> {
		const current = await this.forDocument(document);
		const classes = await this.allClasses();
		return [
			...current.attributes.map(attribute => completion(attribute.name, vscode.CompletionItemKind.Field, attribute.type, attribute.owner)),
			...current.methods.map(method => methodCompletion(method)),
			...classes.map(item => completion(item.name, vscode.CompletionItemKind.Class, `Класс · ID ${item.id}`)),
		];
	}

	async signatureHelp(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.SignatureHelp | undefined> {
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

	async definition(document: vscode.TextDocument, word: string): Promise<{ kind: 'class'; id: number } | { kind: 'method'; method: ClassMethod } | undefined> {
		const current = await this.forDocument(document);
		const method = current.methods.find(item => sameName(item.name, word));
		if (method) {
			return { kind: 'method', method };
		}
		const targetClass = (await this.allClasses()).find(item => sameName(item.name, word));
		if (targetClass) {
			return { kind: 'class', id: targetClass.id };
		}
		const externalMethod = (await findMethodsByName(word))[0];
		return externalMethod
			? { kind: 'method', method: { ...externalMethod, id: String(externalMethod.id), owner: '', signature: '', type: '', visibility: '', package: '', line: '', updatedAt: '', createdBy: '', inherited: false } }
			: undefined;
	}

	private async forDocument(document: vscode.TextDocument): Promise<ClassSymbols> {
		const method = await this.editor.getMethod(document.uri);
		let cached = this.classSymbols.get(method.seniorId);
		if (!cached) {
			cached = (async () => {
				const details = await getClassDetails(method.seniorId);
				const [attributes, methods] = await Promise.all([
					getClassAttributes(details.id, details.name, true),
					getClassMethods(details.id, details.name, true),
				]);
				return { className: details.name, attributes, methods };
			})();
			this.classSymbols.set(method.seniorId, cached);
			cached.catch(() => this.classSymbols.delete(method.seniorId));
		}
		return cached;
	}

	private allClasses(): Promise<ClassTreeRow[]> {
		this.classes ??= loadClasses();
		this.classes.catch(() => { this.classes = undefined; });
		return this.classes;
	}
}

function completion(label: string, kind: vscode.CompletionItemKind, detail?: string, description?: string): vscode.CompletionItem {
	const item = new vscode.CompletionItem(label, kind);
	item.detail = [detail, description].filter(Boolean).join(' · ');
	return item;
}

function methodCompletion(method: ClassMethod): vscode.CompletionItem {
	const item = completion(method.name, vscode.CompletionItemKind.Method, method.signature || method.type, method.owner);
	const parameters = parseParameters(method.signature);
	item.insertText = parameters.length
		? new vscode.SnippetString(`${method.name}(${parameters.map((parameter, index) => `\${${index + 1}:${snippetName(parameter)}}`).join(', ')})`)
		: method.name;
	item.command = { command: 'editor.action.triggerParameterHints', title: 'Показать параметры' };
	return item;
}

function parseParameters(signature: string): string[] {
	const body = signature.match(/\(([^)]*)\)/)?.[1]?.trim();
	return body ? body.split(/[;,]/).map(value => value.trim()).filter(Boolean) : [];
}

function snippetName(parameter: string): string {
	return (parameter.split(/[:=\s]/)[0] || 'параметр').replace(/[}$\\]/g, '');
}

function findCall(text: string): { name: string; parameter: number } | undefined {
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
		} else if (character === ',' && depth === 0) {
			commas++;
		}
	}
	return undefined;
}

function sameName(left: string, right: string): boolean {
	return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0;
}
