"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseClipboardObjectId = parseClipboardObjectId;
exports.parseClipboardNavigationQuery = parseClipboardNavigationQuery;
exports.findClipboardNavigationMatch = findClipboardNavigationMatch;
exports.searchLocalClipboardNavigation = searchLocalClipboardNavigation;
exports.searchTaskClipboardNavigation = searchTaskClipboardNavigation;
exports.navigateToDatabaseObject = navigateToDatabaseObject;
function parseClipboardObjectId(value) {
    const trimmed = value.trim();
    if (!/^\d(?:[\d\s]*\d)?$/.test(trimmed)) {
        return undefined;
    }
    const id = Number(trimmed.replace(/\s/g, ''));
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
function parseClipboardNavigationQuery(value) {
    const directId = parseClipboardObjectId(value);
    if (directId !== undefined) {
        return String(directId);
    }
    const trimmed = value.trim();
    const assignment = trimmed.match(/^(?:id|ид)\s*[:=]\s*(\d(?:[\d\s]*\d)?)$/iu);
    if (assignment) {
        return String(Number(assignment[1].replace(/\s/g, '')));
    }
    try {
        const url = new URL(trimmed);
        if (url.hostname.toLocaleLowerCase('en-US') === 'r.oe-it.ru') {
            const reference = url.pathname.match(/\/(\d+)(?:\/|$)/u)?.[1];
            if (reference) {
                return String(Number(reference));
            }
        }
    }
    catch { /* Clipboard contents are commonly not a URL. */ }
    const entityUri = trimmed.match(/^oe-[^:\s]+:\/{1,2}[^?#\s]*\/(\d+)(?:[?#]|$)/iu);
    return entityUri ? String(Number(entityUri[1])) : undefined;
}
async function findClipboardNavigationMatch(id, actions) {
    const object = await actions.findById(id);
    if (object) {
        return { kind: 'object', object };
    }
    let task;
    let taskError;
    try {
        task = await actions.findTaskByReference(id);
    }
    catch (error) {
        taskError = error;
    }
    if (task) {
        return { kind: 'task', task };
    }
    try {
        const packageValue = (await actions.searchPackages(String(id)))[0];
        if (packageValue) {
            return { kind: 'package', package: packageValue };
        }
    }
    catch (packageError) {
        if (!taskError) {
            throw packageError;
        }
        throw new Error(`Не удалось проверить задачи и пакеты: ${errorMessage(taskError)}; ${errorMessage(packageError)}`);
    }
    if (taskError) {
        throw taskError;
    }
    return undefined;
}
async function searchLocalClipboardNavigation(query, actions) {
    const normalized = query.trim();
    if (!normalized) {
        return { matches: [], errors: [] };
    }
    const [objectResult, packageResult] = await Promise.all([
        settled('объекты', () => actions.searchObjects(normalized)),
        settled('пакеты', () => actions.searchPackages(normalized)),
    ]);
    return {
        matches: [
            ...objectResult.values.map(object => ({ kind: 'object', object })),
            ...packageResult.values.map(packageValue => ({ kind: 'package', package: packageValue })),
        ],
        errors: errorsOf(objectResult, packageResult),
    };
}
async function searchTaskClipboardNavigation(query, actions) {
    const normalized = query.trim();
    if (!normalized) {
        return { matches: [], errors: [] };
    }
    const result = await settled('задачи', () => actions.searchTasks(normalized));
    return {
        matches: result.values.map(task => ({ kind: 'task', task })),
        errors: errorsOf(result),
    };
}
async function settled(source, action) {
    try {
        return { values: await action() };
    }
    catch (error) {
        return { values: [], error: `${source}: ${errorMessage(error)}` };
    }
}
function errorsOf(...results) {
    return results.flatMap(result => result.error ? [result.error] : []);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function navigateToDatabaseObject(object, target, actions) {
    const id = requireId(object.id, 'объекта');
    if (target === 'objectView') {
        await actions.openObject(id);
        return;
    }
    if (target === 'classObjects') {
        if (object.kind !== 'class') {
            throw new Error('Просмотр объектов доступен только для класса.');
        }
        await actions.openClassObjects(id);
        return;
    }
    if (target === 'object') {
        if (object.kind === 'class') {
            await actions.openClass(id);
        }
        else if (object.kind === 'method') {
            await actions.openMethod(id);
        }
        else if (object.kind === 'module') {
            await actions.openModule(id);
        }
        else if (object.kind === 'attribute') {
            await actions.openAttribute(requireId(object.seniorId, 'родительского класса'), id);
        }
        else {
            await actions.openObject(id);
        }
        return;
    }
    if (object.kind === 'class') {
        await actions.revealClass(id);
        await actions.openClass(id);
        return;
    }
    if (object.kind === 'method') {
        await actions.revealMethod(requireId(object.seniorId, 'родительского класса'), id);
        return;
    }
    if (object.kind === 'module') {
        await actions.openModule(id);
        return;
    }
    if (object.kind === 'attribute') {
        await actions.revealClass(requireId(object.seniorId, 'родительского класса'));
        return;
    }
    await actions.openDictionary(requireId(object.classId, 'класса справочника'), id);
}
function requireId(value, description) {
    const id = value === null ? Number.NaN : Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`Не удалось определить ID ${description}.`);
    }
    return id;
}
//# sourceMappingURL=clipboardObjectRouting.js.map