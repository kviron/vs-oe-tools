"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitWorkDescriptionObjectIds = splitWorkDescriptionObjectIds;
const linkPattern = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]|\b[1-9]\d{6,}\b/g;
function splitWorkDescriptionObjectIds(value) {
    const parts = [];
    let offset = 0;
    for (const match of value.matchAll(linkPattern)) {
        const matchOffset = match.index;
        const text = match[0];
        if (/^https?:\/\//i.test(text)) {
            if (matchOffset > offset) {
                parts.push({ text: value.slice(offset, matchOffset) });
            }
            parts.push({ text, href: text });
            offset = matchOffset + text.length;
            continue;
        }
        const id = Number(text);
        if (!Number.isSafeInteger(id)) {
            continue;
        }
        if (matchOffset > offset) {
            parts.push({ text: value.slice(offset, matchOffset) });
        }
        const prefix = value.slice(Math.max(0, matchOffset - 40), matchOffset);
        parts.push({ text, id, kind: /задач\p{L}*\s*(?:№|#|id)?\s*$/ui.test(prefix) ? 'task' : 'object' });
        offset = matchOffset + text.length;
    }
    if (offset < value.length || parts.length === 0) {
        parts.push({ text: value.slice(offset) });
    }
    return parts;
}
//# sourceMappingURL=workDescriptionLinks.js.map