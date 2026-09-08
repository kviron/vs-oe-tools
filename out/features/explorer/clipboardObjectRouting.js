"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseClipboardObjectId = parseClipboardObjectId;
exports.navigateToDatabaseObject = navigateToDatabaseObject;
function parseClipboardObjectId(value) {
    const trimmed = value.trim();
    if (!/^\d(?:[\d\s]*\d)?$/.test(trimmed)) {
        return undefined;
    }
    const id = Number(trimmed.replace(/\s/g, ''));
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
async function navigateToDatabaseObject(object, target, actions) {
    const id = requireId(object.id, 'объекта');
    if (target === 'object') {
        if (object.kind === 'class') {
            await actions.openClass(id);
        }
        else if (object.kind === 'method') {
            await actions.openMethod(id);
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