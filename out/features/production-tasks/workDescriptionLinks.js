"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitWorkDescriptionObjectIds = splitWorkDescriptionObjectIds;
const objectIdPattern = /\b[1-9]\d{6,}\b/g;
function splitWorkDescriptionObjectIds(value) {
    const parts = [];
    let offset = 0;
    for (const match of value.matchAll(objectIdPattern)) {
        const matchOffset = match.index;
        const text = match[0];
        const id = Number(text);
        if (!Number.isSafeInteger(id)) {
            continue;
        }
        if (matchOffset > offset) {
            parts.push({ text: value.slice(offset, matchOffset) });
        }
        parts.push({ text, id });
        offset = matchOffset + text.length;
    }
    if (offset < value.length || parts.length === 0) {
        parts.push({ text: value.slice(offset) });
    }
    return parts;
}
//# sourceMappingURL=workDescriptionLinks.js.map