"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classObjectColumnSettingsKey = classObjectColumnSettingsKey;
exports.normalizeClassObjectColumnSettings = normalizeClassObjectColumnSettings;
const storagePrefix = 'vcVeTools.classObjectColumnSettings';
function classObjectColumnSettingsKey(classId) {
    return `${storagePrefix}.${classId}`;
}
function normalizeClassObjectColumnSettings(availableColumnKeys, stored) {
    const available = uniqueStrings(availableColumnKeys);
    const candidate = isSettingsCandidate(stored) ? stored : undefined;
    const storedOrder = uniqueStrings(candidate?.order ?? []).filter(key => available.includes(key));
    const order = [...storedOrder, ...available.filter(key => !storedOrder.includes(key))];
    const knownStoredColumns = new Set(uniqueStrings(candidate?.order ?? []));
    const storedVisible = uniqueStrings(candidate?.visible ?? []).filter(key => available.includes(key));
    const newlyAvailable = candidate ? available.filter(key => !knownStoredColumns.has(key)) : available;
    const visible = uniqueStrings([...storedVisible, ...newlyAvailable]);
    return {
        visible: visible.length || available.length === 0 ? visible : [available[0]],
        order,
        compact: candidate?.compact ?? true,
    };
}
function isSettingsCandidate(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value;
    return (!('visible' in candidate) || Array.isArray(candidate.visible))
        && (!('order' in candidate) || Array.isArray(candidate.order))
        && (!('compact' in candidate) || typeof candidate.compact === 'boolean');
}
function uniqueStrings(values) {
    return [...new Set(values.filter((value) => typeof value === 'string'))];
}
//# sourceMappingURL=classObjectColumnSettings.js.map