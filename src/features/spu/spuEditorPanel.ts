import * as vscode from 'vscode';
import { isSpuEditorWebviewMessage, type SpuEditorHostMessage } from '../../core/webviewProtocol';
import { createSpu, getSpuEditorOptions, updateSpu } from '../../infrastructure/database/spuRepository';
import { getSqlCompletionSchema } from '../../infrastructure/database/sqlCompletionSchema';

const panels = new Set<vscode.WebviewPanel>();

interface OpenSpuEditorOptions {
	preferredPackageName?: string;
	spuId?: number;
}

export async function openSpuEditor(
	context: vscode.ExtensionContext,
	options: OpenSpuEditorOptions = {},
	onSaved: () => void | Promise<void> = () => undefined,
): Promise<void> {
	const editing = options.spuId !== undefined;
	const assetsRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
	const panel = vscode.window.createWebviewPanel(
		'vc-ve-tools.spuEditor',
		editing ? `SPU ${options.spuId}` : 'Новый SPU',
		vscode.ViewColumn.Active,
		{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [assetsRoot] },
	);
	panels.add(panel);
	panel.webview.html = shell(panel.webview, assetsRoot);
	const output = vscode.window.createOutputChannel('Восточный Экспресс: SPU');
	let saving = false;
	panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isSpuEditorWebviewMessage(message)) { return; }
		if (message.command === 'spuEditorReady') {
			try {
				const editorOptions = await getSpuEditorOptions(options.preferredPackageName, options.spuId);
				await panel.webview.postMessage({ command: 'spuEditorInitialized', options: editorOptions } satisfies SpuEditorHostMessage);
				void getSqlCompletionSchema()
					.then(completion => panel.webview.postMessage({ command: 'sqlCompletionSchemaLoaded', completion } satisfies SpuEditorHostMessage))
					.catch(error => output.appendLine(`[${new Date().toISOString()}] SQL-подсказки недоступны: ${errorMessage(error)}`));
			} catch (error) {
				await panel.webview.postMessage({ command: 'spuSaveFailed', message: errorMessage(error) } satisfies SpuEditorHostMessage);
			}
			return;
		}
		if (saving) { return; }
		if (message.draft.sqlScript.trim() && !message.draft.sqlScript.trimEnd().endsWith(';')) {
			const decision = await vscode.window.showWarningMessage(
				`В конце SQL-скрипта отсутствует «;». Всё равно ${editing ? 'сохранить' : 'создать'} SPU?`,
				{ modal: true },
				editing ? 'Сохранить' : 'Создать',
			);
			if (decision !== (editing ? 'Сохранить' : 'Создать')) { return; }
		}
		saving = true;
		await panel.webview.postMessage({ command: 'spuSaving' } satisfies SpuEditorHostMessage);
		try {
			const logger = (value: string): void => output.appendLine(`[${new Date().toISOString()}] ${value}`);
			const saved = options.spuId === undefined
				? await createSpu(message.draft, logger)
				: await updateSpu(options.spuId, message.draft, logger);
			panel.title = `SPU ${saved.id} — ${saved.name}`;
			await panel.webview.postMessage({ command: 'spuSaved', saved } satisfies SpuEditorHostMessage);
			void Promise.resolve(onSaved()).catch(error => {
				output.appendLine(`[${new Date().toISOString()}] SPU сохранён, но список не обновлён: ${errorMessage(error)}`);
			});
			void vscode.window.showInformationMessage(`SPU ${saved.id} ${editing ? 'сохранён' : 'создан'}. Пакетный файл: ${saved.fileId}.`);
		} catch (error) {
			output.appendLine(`[${new Date().toISOString()}] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
			output.show(true);
			await panel.webview.postMessage({ command: 'spuSaveFailed', message: errorMessage(error) } satisfies SpuEditorHostMessage);
		} finally {
			saving = false;
		}
	});
	panel.onDidDispose(() => {
		panels.delete(panel);
		output.dispose();
	});
}

export function closeSpuEditorPanels(): void {
	for (const panel of panels) { panel.dispose(); }
	panels.clear();
}

function shell(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'spu-editor.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'spu-editor.css'));
	const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
	return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csp-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Редактор SPU</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
