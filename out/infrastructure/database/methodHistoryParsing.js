"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCodeFromChangeValues = extractCodeFromChangeValues;
/** Reads attribute 127 (Methods.Code); returns undefined for audit rows about other attributes. */
function extractCodeFromChangeValues(value) {
    if (!value) {
        return undefined;
    }
    const marker = /(?:^|,)127,/.exec(value);
    if (!marker || marker.index === undefined) {
        return undefined;
    }
    const start = marker.index + marker[0].length;
    if (value[start] !== '"') {
        const end = value.indexOf(',102,', start);
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
    throw new Error('Не удалось прочитать Methods.Code (атрибут 127): не найдена закрывающая кавычка.');
}
//# sourceMappingURL=methodHistoryParsing.js.map