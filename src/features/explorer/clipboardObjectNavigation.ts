import * as vscode from 'vscode';
import { navigateToDatabaseObject, parseClipboardObjectId, type ClipboardObjectNavigationActions } from './clipboardObjectRouting';

export function registerClipboardObjectNavigation(actions: ClipboardObjectNavigationActions): vscode.Disposable {
	return vscode.commands.registerCommand('vc-ve-tools.openClipboardObject', async (requestedId?: number) => {
		const id = requestedId === undefined
			? parseClipboardObjectId(await vscode.env.clipboard.readText())
			: Number.isSafeInteger(requestedId) && requestedId > 0 ? requestedId : undefined;
		if (id === undefined) {
			void vscode.window.showWarningMessage('В буфере обмена нет корректного положительного ID объекта.');
			return;
		}
		try {
			const object = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Поиск объекта ID=${id}` },
				() => actions.findById(id),
			);
			if (!object) {
				throw new Error(`Объект ID=${id} не найден.`);
			}
			const selected = await vscode.window.showQuickPick([
				{ label: 'Показать в проводнике', description: explorerDescription(object.kind), target: 'explorer' as const },
				{ label: 'Открыть объект', description: objectDescription(object.kind), target: 'object' as const },
			], {
				placeHolder: `${object.name || 'Объект'} · ID=${id}`,
				title: 'Как открыть объект?',
			});
			if (selected) {
				await navigateToDatabaseObject(object, selected.target, actions);
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось открыть объект ID=${id}: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
}

function explorerDescription(kind: string): string {
	if (kind === 'method') { return 'Открыть родительский класс и выделить метод'; }
	if (kind === 'attribute') { return 'Показать родительский класс'; }
	if (kind === 'class') { return 'Раскрыть класс в дереве'; }
	return 'Открыть справочник класса';
}

function objectDescription(kind: string): string {
	if (kind === 'method') { return 'Открыть код метода в редакторе'; }
	if (kind === 'attribute') { return 'Открыть карточку атрибута'; }
	if (kind === 'class') { return 'Открыть карточку класса'; }
	return 'Открыть просмотр записи справочника';
}
