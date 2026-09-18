import * as vscode from 'vscode';
import {
	findClipboardNavigationMatch,
	navigateToDatabaseObject,
	parseClipboardNavigationQuery,
	searchLocalClipboardNavigation,
	searchTaskClipboardNavigation,
	type ClipboardNavigationMatch,
	type ClipboardNavigationTarget,
	type ClipboardObjectNavigationActions,
} from './clipboardObjectRouting';

const historyKey = 'quickNavigation.history';
const maximumHistoryItems = 10;
const searchDelayMilliseconds = 300;
const defaultPlaceholder = 'ID, ID=…, ссылка на задачу, название объекта, задачи или пакета';

interface NavigationQuickPickItem extends vscode.QuickPickItem {
	match?: ClipboardNavigationMatch;
	historyQuery?: string;
}

export function registerClipboardObjectNavigation(actions: ClipboardObjectNavigationActions, workspaceState?: vscode.Memento): vscode.Disposable {
	return vscode.commands.registerCommand('vc-ve-tools.openClipboardObject', async (requestedId?: number, requestedTarget?: ClipboardNavigationTarget) => {
		const directId = requestedId !== undefined && Number.isSafeInteger(requestedId) && requestedId > 0 ? requestedId : undefined;
		const directTarget = requestedTarget === 'explorer' || requestedTarget === 'object' || requestedTarget === 'objectView' || requestedTarget === 'classObjects' ? requestedTarget : undefined;
		try {
			if (directId !== undefined) {
				const match = await findClipboardNavigationMatch(directId, actions);
				if (!match) { throw new Error(`Ничего не найдено для ID=${directId}.`); }
				if (await openMatch(match, actions, directTarget)) {
					await rememberQuery(workspaceState, queryForMatch(match));
				}
				return;
			}

			const clipboardQuery = parseClipboardNavigationQuery(await vscode.env.clipboard.readText());
			const selected = await showNavigationPicker(actions, workspaceState, clipboardQuery);
			if (!selected?.match) { return; }
			if (await openMatch(selected.match, actions)) {
				await rememberQuery(workspaceState, queryForMatch(selected.match));
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось выполнить быстрый переход: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
}

async function showNavigationPicker(
	actions: ClipboardObjectNavigationActions,
	workspaceState: vscode.Memento | undefined,
	initialQuery: string | undefined,
): Promise<NavigationQuickPickItem | undefined> {
	const picker = vscode.window.createQuickPick<NavigationQuickPickItem>();
	picker.title = 'Быстрый переход';
	picker.placeholder = defaultPlaceholder;
	picker.matchOnDescription = true;
	picker.matchOnDetail = true;
	picker.value = initialQuery ?? '';
	let revision = 0;
	let timer: NodeJS.Timeout | undefined;
	let accepted: NavigationQuickPickItem | undefined;
	let closed = false;

	const update = async (query: string, currentRevision: number): Promise<void> => {
		const normalized = query.trim();
		if (!normalized) {
			picker.busy = false;
			picker.items = historyItems(workspaceState);
			return;
		}
		const localResult = await searchLocalClipboardNavigation(normalized, actions);
		if (closed || currentRevision !== revision) { return; }
		showSearchResult(picker, localResult, true);

		const taskResult = await searchTaskClipboardNavigation(normalized, actions);
		if (closed || currentRevision !== revision) { return; }
		showSearchResult(picker, {
			matches: [...localResult.matches, ...taskResult.matches],
			errors: [...localResult.errors, ...taskResult.errors],
		}, false);
	};

	picker.onDidChangeValue(value => {
		const currentRevision = ++revision;
		if (timer) { clearTimeout(timer); }
		picker.busy = Boolean(value.trim());
		picker.items = value.trim() ? [] : historyItems(workspaceState);
		picker.placeholder = defaultPlaceholder;
		timer = setTimeout(() => void update(value, currentRevision), searchDelayMilliseconds);
	});
	picker.onDidAccept(() => {
		const item = picker.selectedItems[0];
		if (!item) { return; }
		if (item.historyQuery) {
			picker.value = item.historyQuery;
			return;
		}
		accepted = item;
		picker.hide();
	});
	const result = new Promise<NavigationQuickPickItem | undefined>(resolve => {
		picker.onDidHide(() => { closed = true; revision++; resolve(accepted); });
	});
	picker.show();
	void update(picker.value, ++revision);
	const selected = await result;
	if (timer) { clearTimeout(timer); }
	picker.dispose();
	return selected;
}

function showSearchResult(
	picker: vscode.QuickPick<NavigationQuickPickItem>,
	result: { matches: ClipboardNavigationMatch[]; errors: string[] },
	searchingTasks: boolean,
): void {
	picker.busy = searchingTasks;
	picker.items = result.matches.length > 0
		? result.matches.map(matchItem)
		: [{ label: searchingTasks ? 'Поиск задач…' : 'Совпадений не найдено', description: result.errors[0], kind: vscode.QuickPickItemKind.Separator }];
	picker.placeholder = result.errors.length > 0
		? 'Часть источников недоступна — доступные результаты показаны'
		: defaultPlaceholder;
}

function historyItems(workspaceState: vscode.Memento | undefined): NavigationQuickPickItem[] {
	const history = workspaceState?.get<string[]>(historyKey, []) ?? [];
	if (history.length === 0) {
		return [{ label: 'Начните ввод для поиска', kind: vscode.QuickPickItemKind.Separator }];
	}
	return [
		{ label: 'Недавние переходы', kind: vscode.QuickPickItemKind.Separator },
		...history.map(query => ({ label: `$(history) ${query}`, historyQuery: query, alwaysShow: true })),
	];
}

function matchItem(match: ClipboardNavigationMatch): NavigationQuickPickItem {
	if (match.kind === 'task') {
		return {
			label: `$(issues) Задача ${match.task.number || match.task.id}`,
			description: match.task.state,
			detail: match.task.title,
			match,
		};
	}
	if (match.kind === 'package') {
		return { label: `$(package) ${match.package.name}`, description: `Пакет · ID=${match.package.id}`, match };
	}
	const object = match.object;
	return {
		label: `${objectIcon(object.kind)} ${object.name || `Объект ${object.id}`}`,
		description: `${kindLabel(object.kind)} · ID=${object.id}`,
		detail: [object.ownerName && `Владелец: ${object.ownerName}`, object.packageName && `Пакет: ${object.packageName}`].filter(Boolean).join(' · '),
		match,
	};
}

async function openMatch(match: ClipboardNavigationMatch, actions: ClipboardObjectNavigationActions, directTarget?: ClipboardNavigationTarget): Promise<boolean> {
	if (match.kind === 'task') { await actions.openTask(match.task); return true; }
	if (match.kind === 'package') { await actions.revealPackage(match.package.id); return true; }
	const targets = [
		{ label: 'Показать в проводнике', description: explorerDescription(match.object.kind), target: 'explorer' as const },
		{ label: 'Открыть объект', description: objectDescription(match.object.kind), target: 'object' as const },
		{ label: 'Универсальный просмотр', description: 'Компактная таблица всех атрибутов и свойств объекта', target: 'objectView' as const },
		...(match.object.kind === 'class' ? [{
			label: 'Открыть просмотр объектов',
			description: 'Показать таблицу справочника класса',
			target: 'classObjects' as const,
		}] : []),
		{ label: 'Показать историю изменений', description: historyDescription(match.object.kind), target: 'history' as const },
	];
	const target = directTarget ?? (await vscode.window.showQuickPick(targets, {
		placeHolder: `${match.object.name || 'Объект'} · ID=${match.object.id}`,
		title: 'Как открыть объект?',
	}))?.target;
	if (!target) { return false; }
	if (target === 'history') {
		await actions.openHistory(match.object);
		return true;
	}
	await navigateToDatabaseObject(match.object, target, actions);
	return true;
}

async function rememberQuery(workspaceState: vscode.Memento | undefined, query: string): Promise<void> {
	if (!workspaceState) { return; }
	const history = workspaceState.get<string[]>(historyKey, []);
	await workspaceState.update(historyKey, [query, ...history.filter(item => item !== query)].slice(0, maximumHistoryItems));
}

function queryForMatch(match: ClipboardNavigationMatch): string {
	if (match.kind === 'object') { return match.object.id; }
	if (match.kind === 'package') { return match.package.name; }
	return match.task.number || String(match.task.id);
}

function objectIcon(kind: string): string {
	if (kind === 'class') { return '$(symbol-class)'; }
	if (kind === 'method') { return '$(symbol-method)'; }
	if (kind === 'module') { return '$(code)'; }
	if (kind === 'attribute') { return '$(symbol-field)'; }
	return '$(symbol-object)';
}

function kindLabel(kind: string): string {
	if (kind === 'class') { return 'Класс'; }
	if (kind === 'method') { return 'Метод'; }
	if (kind === 'module') { return 'Модуль'; }
	if (kind === 'attribute') { return 'Атрибут'; }
	if (kind === 'lifecycle') { return 'Жизненный цикл'; }
	if (kind === 'journal') { return 'Журнал'; }
	if (kind === 'list') { return 'Список'; }
	return 'Объект';
}

function explorerDescription(kind: string): string {
	if (kind === 'method') { return 'Открыть родительский класс и выделить метод'; }
	if (kind === 'module') { return 'Открыть код модуля'; }
	if (kind === 'attribute') { return 'Показать родительский класс'; }
	if (kind === 'class') { return 'Раскрыть класс в дереве'; }
	return 'Открыть справочник класса';
}

function objectDescription(kind: string): string {
	if (kind === 'method') { return 'Открыть код метода в редакторе'; }
	if (kind === 'module') { return 'Открыть код модуля в редакторе'; }
	if (kind === 'attribute') { return 'Открыть карточку атрибута'; }
	if (kind === 'class') { return 'Открыть карточку класса'; }
	return 'Открыть просмотр записи справочника';
}

function historyDescription(kind: string): string {
	return kind === 'method' || kind === 'module'
		? 'Показать только SVN-ревизии кода этого объекта'
		: 'Показать SVN-историю связанного файла пакета';
}
