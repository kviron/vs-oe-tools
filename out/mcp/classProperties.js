"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectVisibleProperties = selectVisibleProperties;
function selectVisibleProperties(properties, includeShadowed) {
    if (includeShadowed) {
        return properties;
    }
    const visible = new Map();
    for (const property of properties) {
        const key = property.name.toLocaleUpperCase('ru');
        if (!visible.has(key)) {
            visible.set(key, property);
        }
    }
    return [...visible.values()];
}
//# sourceMappingURL=classProperties.js.map