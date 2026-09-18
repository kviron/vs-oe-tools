"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCodeFromChangeValues = extractCodeFromChangeValues;
/** Reads one serialized code attribute; returns undefined for audit rows about other attributes. */
function extractCodeFromChangeValues(value, attributeId = 127) {
    if (!value) {
        return undefined;
    }
    if (!Number.isSafeInteger(attributeId) || attributeId <= 0) {
        return undefined;
    }
    const marker = new RegExp(`(?:^|,)${attributeId},`).exec(value);
    if (!marker || marker.index === undefined) {
        return undefined;
    }
    const start = marker.index + marker[0].length;
    if (value[start] !== '"') {
        const end = value.indexOf(',', start);
        return value.slice(start, end < 0 ? value.length : end);
    }
    let code = '';
    for (let index = start + 1; index < value.length; index++) {
        if (value[index] !== '"') {
            code += value[index];
            continue;
        }
        if (value[index + 1] === '"') {
            code += '"';
            index++;
            continue;
        }
        return code;
    }
    throw new Error(`Не удалось прочитать атрибут кода ${attributeId}: не найдена закрывающая кавычка.`);
}
//# sourceMappingURL=methodHistoryParsing.js.map