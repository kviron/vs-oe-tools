import * as vscode from 'vscode';
import { searchDatabaseObjects } from '../../infrastructure/database/objectSearchRepository';
import { readNativeLog } from './nativeLogService';

const logScheme = 've-log';
const objectIdPattern = /\b[1-9]\d{6,}\b/gu;

export class NativeLogEditorProvider implements vscode.TextDocumentContentProvider, vscode.DocumentLinkProvider, vscode.HoverProvider {
	public async open(fileName: string): Promise<void> {
		const uri = vscode.Uri.from({ scheme: logScheme, path: `/${fileName}` });
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });
	}

	public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) { throw new Error('Откройте папку проекта Восточного Экспресса.'); }
		return (await readNativeLog(workspacePath, decodeURIComponent(uri.path.slice(1)), 1, 100_000)).content;
	}

	public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
		const links: vscode.DocumentLink[] = [];
		for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
			const line = document.lineAt(lineIndex).text;
			for (const match of line.matchAll(objectIdPattern)) {
				const id = Number(match[0]);
				const range = new vscode.Range(lineIndex, match.index, lineIndex, match.index + match[0].length);
				const args = encodeURIComponent(JSON.stringify([id, 'object']));
				links.push(new vscode.DocumentLink(range, vscode.Uri.parse(`command:vc-ve-tools.openClipboardObject?${args}`)));
			}
		}
		return links;
	}

	public async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
		const range = document.getWordRangeAtPosition(position, /[1-9]\d{6,}/u);
		if (!range) { return undefined; }
		const id = Number(document.getText(range));
		const object = (await searchDatabaseObjects(String(id), 1))[0];
		if (!object || Number(object.id) !== id) { return undefined; }
		const markdown = new vscode.MarkdownString(undefined, true);
		markdown.isTrusted = { enabledCommands: ['vc-ve-tools.openClipboardObject'] };
		markdown.appendMarkdown(`**${escapeMarkdown(object.name || `Объект ${id}`)}**  \n`);
		markdown.appendMarkdown(`${escapeMarkdown(object.metaClassName || object.kind)} · ID ${id}  \n`);
		if (object.ownerName) { markdown.appendMarkdown(`Владелец: ${escapeMarkdown(object.ownerName)}  \n`); }
		if (object.packageName) { markdown.appendMarkdown(`Пакет: ${escapeMarkdown(object.packageName)}  \n`); }
		const args = encodeURIComponent(JSON.stringify([id, 'object']));
		markdown.appendMarkdown(`[Открыть объект](command:vc-ve-tools.openClipboardObject?${args})`);
		return new vscode.Hover(markdown, range);
	}

	public registrations(): vscode.Disposable[] {
		const selector = { scheme: logScheme };
		return [
			vscode.workspace.registerTextDocumentContentProvider(logScheme, this),
			vscode.languages.registerDocumentLinkProvider(selector, this),
			vscode.languages.registerHoverProvider(selector, this),
		];
	}
}

function escapeMarkdown(value: string): string { return value.replace(/[\\`*_{}[\]()#+\-.!]/gu, '\\$&'); }
