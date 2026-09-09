"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPackagePlaceholderItem = isPackagePlaceholderItem;
exports.parsePackagePlaceholderObjects = parsePackagePlaceholderObjects;
exports.createPackagePlaceholderIssues = createPackagePlaceholderIssues;
const packagePlaceholder = '#package$';
function isPackagePlaceholderItem(item) {
    return [item.localPath, item.objectPath].filter((value) => Boolean(value)).some(value => value.split(/[\\/]+/u)
        .some(segment => segment.trim().replace(/\.pkf$/iu, '').toLocaleLowerCase('en-US') === packagePlaceholder));
}
function parsePackagePlaceholderObjects(content) {
    const objects = [];
    const declaration = /^\s*object\s+(?:\$"([^"]+)"|([^\s:]+))\s*:\s*([^\r\n;]+)\s*\r?\n\s*_Ид\s*=\s*'(\d+)'\s*;/gimu;
    for (const match of content.matchAll(declaration)) {
        objects.push({
            objectId: Number(match[4]),
            objectName: match[1] ?? match[2],
            objectType: match[3].trim(),
        });
    }
    return objects;
}
function createPackagePlaceholderIssues(item, filePath, objects) {
    return objects.map(object => ({
        objectId: object.objectId,
        objectName: object.objectName,
        classId: null,
        className: object.objectType,
        packagePath: item.packagePath,
        objectPath: item.objectPath,
        filePath,
        changedBy: item.changedBy,
        message: `Объект «${object.objectName}» (ID ${object.objectId}) попал в ${packagePlaceholder}.pkf — извлеките его из этого файла`,
        type: 'package-placeholder',
    }));
}
//# sourceMappingURL=packageSyncIssues.js.map