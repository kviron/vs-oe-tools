import * as vscode from 'vscode';

const output = vscode.window.createOutputChannel('Восточный Экспресс: Выделение таблиц');

export function logTableSelection(source: string, message: string): void {
	output.appendLine(`[${new Date().toISOString()}] [${source}] ${message}`);
}
