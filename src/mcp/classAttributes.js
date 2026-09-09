"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAttributeValue = readAttributeValue;
exports.selectVisibleAttributes = selectVisibleAttributes;
exports.quotePostgresIdentifier = quotePostgresIdentifier;
function readAttributeValue(row, ...names) {
    const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
    for (const name of names) {
        const value = values.get(name.toLowerCase());
        if (value !== undefined && value !== null) {
            return String(value);
        }
    }
    return '';
}
function selectVisibleAttributes(attributes, includeShadowed) {
    if (includeShadowed) {
        return attributes;
    }
    const visible = new Map();
    for (const attribute of attributes) {
        const key = attribute.name.toLocaleUpperCase('ru');
        if (!visible.has(key)) {
            visible.set(key, attribute);
        }
    }
    return [...visible.values()];
}
function quotePostgresIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
//# sourceMappingURL=classAttributes.js.map