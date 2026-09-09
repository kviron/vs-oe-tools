"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyPkf = createEmptyPkf;
exports.parseSerializedAttributeValues = parseSerializedAttributeValues;
exports.extractPkfObjectIds = extractPkfObjectIds;
exports.appendPkfObjects = appendPkfObjects;
exports.serializePkfObject = serializePkfObject;
function createEmptyPkf(autogroup, newline = '\r\n') {
    const lines = ['file'];
    if (autogroup?.trim()) {
        lines.push(`  autogroup '${escapePkfString(autogroup.trim())}';`);
    }
    lines.push('data', 'end.');
    return `${lines.join(newline)}${newline}`;
}
function parseSerializedAttributeValues(source) {
    const fields = parseCsvFields(source);
    if (fields.length % 2 !== 0) {
        throw new Error('Журнал содержит непарное количество ID атрибутов и значений.');
    }
    const result = [];
    for (let index = 0; index < fields.length; index += 2) {
        const attributeId = Number(fields[index]);
        if (!Number.isSafeInteger(attributeId)) {
            throw new Error(`Некорректный ID атрибута в журнале: ${fields[index] ?? ''}.`);
        }
        result.push({ attributeId, value: fields[index + 1] ?? '' });
    }
    return result;
}
function extractPkfObjectIds(source) {
    const ids = new Set();
    for (const match of source.matchAll(/^\s*_Ид\s*=\s*'(\d+)'\s*;/gmu)) {
        ids.add(Number(match[1]));
    }
    return ids;
}
function appendPkfObjects(source, objects) {
    if (!/^file\r?\n(?:  autogroup '.*';\r?\n)?data\s*$/mu.test(source)) {
        throw new Error('Файл не похож на PKF (не найден заголовок file/data).');
    }
    const existingIds = extractPkfObjectIds(source);
    for (const object of objects) {
        if (existingIds.has(object.id)) {
            throw new Error(`Объект ID ${object.id} уже присутствует в локальном PKF.`);
        }
    }
    const finalMarker = source.match(/^end\.\s*$/mu);
    if (!finalMarker || finalMarker.index === undefined) {
        throw new Error('В PKF не найден завершающий маркер end.');
    }
    if (!objects.length) {
        return source;
    }
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const existingBlocks = [...source.matchAll(/^  object .*?^  end;\r?$/gmsu)].map(match => ({
        id: Number(match[0].match(/^\s*_Ид\s*=\s*'(\d+)'\s*;/mu)?.[1]), position: match.index,
    }));
    if (existingBlocks.some(block => !Number.isSafeInteger(block.id))) {
        throw new Error('Не удалось определить ID одного из объектов PKF.');
    }
    if (existingBlocks.some((block, index) => index > 0 && existingBlocks[index - 1].id > block.id)) {
        throw new Error('Порядок объектов PKF отличается от ожидаемой сортировки по ID.');
    }
    const insertions = new Map();
    for (const object of [...objects].sort((left, right) => left.id - right.id)) {
        const position = existingBlocks.find(block => block.id > object.id)?.position ?? finalMarker.index;
        const group = insertions.get(position) ?? [];
        group.push(object);
        insertions.set(position, group);
    }
    let result = source;
    for (const [position, group] of [...insertions].sort(([left], [right]) => right - left)) {
        const serialized = group.map(object => serializePkfObject(object, newline)).join(newline);
        result = `${result.slice(0, position)}${serialized}${newline}${result.slice(position)}`;
    }
    return result;
}
function serializePkfObject(object, newline = '\n') {
    if (!object.className.trim()) {
        throw new Error(`Для объекта ID ${object.id} не определено имя класса.`);
    }
    return [
        `  object ${formatPkfObjectName(object.name)}: ${object.className}`,
        `    _Ид = '${object.id}';`,
        ...[...object.properties].sort((left, right) => left.attributeId - right.attributeId).map(property => serializePkfProperty(property, newline)),
        '  end;',
    ].join(newline);
}
function serializePkfProperty(property, newline) {
    const name = property.name.toLocaleLowerCase('ru') === 'comment' ? `$${property.name}` : property.name;
    if (property.format === 'scalar') {
        return `    ${name} = '${escapePkfString(property.value)}';`;
    }
    const normalized = property.value.replace(/\r\n|\r|\n/g, newline);
    const indented = normalized.split(newline).map(line => `    ${line}`).join(newline);
    return `    ${name} = {{${newline}${indented}}};`;
}
function formatPkfObjectName(value) {
    if (!value || value === '$') {
        return '$';
    }
    return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(value) ? value : `$"${value.replace(/"/g, '""')}"`;
}
function parseCsvFields(source) {
    const fields = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') {
                value += '"';
                index++;
                continue;
            }
            if (character === '"') {
                quoted = false;
                continue;
            }
            value += character;
            continue;
        }
        if (character === '"' && value.length === 0) {
            quoted = true;
            continue;
        }
        if (character === ',') {
            fields.push(value);
            value = '';
            continue;
        }
        value += character;
    }
    if (quoted) {
        throw new Error('В журнале не закрыта двойная кавычка.');
    }
    fields.push(value);
    return fields;
}
function escapePkfString(value) { return value.replace(/'/g, "''"); }
//# sourceMappingURL=pkfDatabaseReconstruction.js.map