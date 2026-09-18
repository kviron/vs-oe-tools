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
exports.registerClipboardObjectNavigation = registerClipboardObjectNavigation;
const vscode = __importStar(require("vscode"));
const clipboardObjectRouting_1 = require("./clipboardObjectRouting");
const historyKey = 'quickNavigation.history';
const maximumHistoryItems = 10;
const searchDelayMilliseconds = 300;
const defaultPlaceholder = 'ID, ID=…, ссылка на задачу, название объекта, задачи или пакета';
function registerClipboardObjectNavigation(actions, workspaceState) {
    return vscode.commands.registerCommand('vc-ve-tools.openClipboardObject', async (requestedId, requestedTarget) => {
        const directId = requestedId !== undefined && Number.isSafeInteger(requestedId) && requestedId > 0 ? requestedId : undefined;
        const directTarget = requestedTarget === 'explorer' || requestedTarget === 'object' || requestedTarget === 'objectView' || requestedTarget === 'classObjects' ? requestedTarget : undefined;
        try {
            if (directId !== undefined) {
                const match = await (0, clipboardObjectRouting_1.findClipboardNavigationMatch)(directId, actions);
                if (!match) {
                    throw new Error(`Ничего не найдено для ID=${directId}.`);
                }
                if (await openMatch(match, actions, directTarget)) {
                    await rememberQuery(workspaceState, queryForMatch(match));
                }
                return;
            }
            const clipboardQuery = (0, clipboardObjectRouting_1.parseClipboardNavigationQuery)(await vscode.env.clipboard.readText());
            const selected = await showNavigationPicker(actions, workspaceState, clipboardQuery);
            if (!selected?.match) {
                return;
            }
            if (await openMatch(selected.match, actions)) {
                await rememberQuery(workspaceState, queryForMatch(selected.match));
            }
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось выполнить быстрый переход: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}
async function showNavigationPicker(actions, workspaceState, initialQuery) {
    const picker = vscode.window.createQuickPick();
    picker.title = 'Быстрый переход';
    picker.placeholder = defaultPlaceholder;
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.value = initialQuery ?? '';
    let revision = 0;
    let timer;
    let accepted;
    let closed = false;
    const update = async (query, currentRevision) => {
        const normalized = query.trim();
        if (!normalized) {
            picker.busy = false;
            picker.items = historyItems(workspaceState);
            return;
        }
        const localResult = await (0, clipboardObjectRouting_1.searchLocalClipboardNavigation)(normalized, actions);
        if (closed || currentRevision !== revision) {
            return;
        }
        showSearchResult(picker, localResult, true);
        const taskResult = await (0, clipboardObjectRouting_1.searchTaskClipboardNavigation)(normalized, actions);
        if (closed || currentRevision !== revision) {
            return;
        }
        showSearchResult(picker, {
            matches: [...localResult.matches, ...taskResult.matches],
            errors: [...localResult.errors, ...taskResult.errors],
        }, false);
    };
    picker.onDidChangeValue(value => {
        const currentRevision = ++revision;
        if (timer) {
            clearTimeout(timer);
        }
        picker.busy = Boolean(value.trim());
        picker.items = value.trim() ? [] : historyItems(workspaceState);
        picker.placeholder = defaultPlaceholder;
        timer = setTimeout(() => void update(value, currentRevision), searchDelayMilliseconds);
    });
    picker.onDidAccept(() => {
        const item = picker.selectedItems[0];
        if (!item) {
            return;
        }
        if (item.historyQuery) {
            picker.value = item.historyQuery;
            return;
        }
        accepted = item;
        picker.hide();
    });
    const result = new Promise(resolve => {
        picker.onDidHide(() => { closed = true; revision++; resolve(accepted); });
    });
    picker.show();
    void update(picker.value, ++revision);
    const selected = await result;
    if (timer) {
        clearTimeout(timer);
    }
    picker.dispose();
    return selected;
}
function showSearchResult(picker, result, searchingTasks) {
    picker.busy = searchingTasks;
    picker.items = result.matches.length > 0
        ? result.matches.map(matchItem)
        : [{ label: searchingTasks ? 'Поиск задач…' : 'Совпадений не найдено', description: result.errors[0], kind: vscode.QuickPickItemKind.Separator }];
    picker.placeholder = result.errors.length > 0
        ? 'Часть источников недоступна — доступные результаты показаны'
        : defaultPlaceholder;
}
function historyItems(workspaceState) {
    const history = workspaceState?.get(historyKey, []) ?? [];
    if (history.length === 0) {
        return [{ label: 'Начните ввод для поиска', kind: vscode.QuickPickItemKind.Separator }];
    }
    return [
        { label: 'Недавние переходы', kind: vscode.QuickPickItemKind.Separator },
        ...history.map(query => ({ label: `$(history) ${query}`, historyQuery: query, alwaysShow: true })),
    ];
}
function matchItem(match) {
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
async function openMatch(match, actions, directTarget) {
    if (match.kind === 'task') {
        await actions.openTask(match.task);
        return true;
    }
    if (match.kind === 'package') {
        await actions.revealPackage(match.package.id);
        return true;
    }
    const targets = [
        { label: 'Показать в проводнике', description: explorerDescription(match.object.kind), target: 'explorer' },
        { label: 'Открыть объект', description: objectDescription(match.object.kind), target: 'object' },
        { label: 'Универсальный просмотр', description: 'Компактная таблица всех атрибутов и свойств объекта', target: 'objectView' },
        ...(match.object.kind === 'class' ? [{
                label: 'Открыть просмотр объектов',
                description: 'Показать таблицу справочника класса',
                target: 'classObjects',
            }] : []),
        { label: 'Показать историю изменений', description: historyDescription(match.object.kind), target: 'history' },
    ];
    const target = directTarget ?? (await vscode.window.showQuickPick(targets, {
        placeHolder: `${match.object.name || 'Объект'} · ID=${match.object.id}`,
        title: 'Как открыть объект?',
    }))?.target;
    if (!target) {
        return false;
    }
    if (target === 'history') {
        await actions.openHistory(match.object);
        return true;
    }
    await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(match.object, target, actions);
    return true;
}
async function rememberQuery(workspaceState, query) {
    if (!workspaceState) {
        return;
    }
    const history = workspaceState.get(historyKey, []);
    await workspaceState.update(historyKey, [query, ...history.filter(item => item !== query)].slice(0, maximumHistoryItems));
}
function queryForMatch(match) {
    if (match.kind === 'object') {
        return match.object.id;
    }
    if (match.kind === 'package') {
        return match.package.name;
    }
    return match.task.number || String(match.task.id);
}
function objectIcon(kind) {
    if (kind === 'class') {
        return '$(symbol-class)';
    }
    if (kind === 'method') {
        return '$(symbol-method)';
    }
    if (kind === 'module') {
        return '$(code)';
    }
    if (kind === 'attribute') {
        return '$(symbol-field)';
    }
    return '$(symbol-object)';
}
function kindLabel(kind) {
    if (kind === 'class') {
        return 'Класс';
    }
    if (kind === 'method') {
        return 'Метод';
    }
    if (kind === 'module') {
        return 'Модуль';
    }
    if (kind === 'attribute') {
        return 'Атрибут';
    }
    if (kind === 'lifecycle') {
        return 'Жизненный цикл';
    }
    if (kind === 'journal') {
        return 'Журнал';
    }
    if (kind === 'list') {
        return 'Список';
    }
    return 'Объект';
}
function explorerDescription(kind) {
    if (kind === 'method') {
        return 'Открыть родительский класс и выделить метод';
    }
    if (kind === 'module') {
        return 'Открыть код модуля';
    }
    if (kind === 'attribute') {
        return 'Показать родительский класс';
    }
    if (kind === 'class') {
        return 'Раскрыть класс в дереве';
    }
    return 'Открыть справочник класса';
}
function objectDescription(kind) {
    if (kind === 'method') {
        return 'Открыть код метода в редакторе';
    }
    if (kind === 'module') {
        return 'Открыть код модуля в редакторе';
    }
    if (kind === 'attribute') {
        return 'Открыть карточку атрибута';
    }
    if (kind === 'class') {
        return 'Открыть карточку класса';
    }
    return 'Открыть просмотр записи справочника';
}
function historyDescription(kind) {
    return kind === 'method' || kind === 'module'
        ? 'Показать только SVN-ревизии кода этого объекта'
        : 'Показать SVN-историю связанного файла пакета';
}
//# sourceMappingURL=clipboardObjectNavigation.js.map