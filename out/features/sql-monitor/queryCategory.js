"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlQueryCategories = void 0;
exports.classifySqlQuery = classifySqlQuery;
exports.sqlQueryCategoryLabel = sqlQueryCategoryLabel;
exports.sqlQueryCategories = [
    { value: 'application', label: 'Прикладные' },
    { value: 'metadata', label: 'Метаданные' },
    { value: 'system', label: 'Системные' },
    { value: 'transaction', label: 'Транзакции' },
];
const metadataTables = new Set([
    'abstract',
    'attributes',
    'classes',
    'methods',
    'modules',
    'objectmetadatamap',
    'objcomments',
    'properties',
    'sysfile',
]);
function classifySqlQuery(record) {
    const text = record.text.trim().toLocaleLowerCase('en');
    const table = record.firstTable?.trim().toLocaleLowerCase('en') ?? '';
    if (/^(?:start\s+transaction|commit|rollback)\b/.test(text)) {
        return 'transaction';
    }
    if (metadataTables.has(table)) {
        return 'metadata';
    }
    if (/\b(?:objectmetadatamap|objcomments)\b/.test(text)
        || /\b(?:from|join)\s+(?:abstract|attributes|classes|methods|modules|properties|sysfile)\b/.test(text)) {
        return 'metadata';
    }
    if (table.startsWith('oe_system_')
        || /\b(?:oe_system_|developerids|enum(?:paircommaitems)?|logusercolumnsoptionsusage|pg_catalog|information_schema|syncidranges)\b/.test(text)) {
        return 'system';
    }
    return 'application';
}
function sqlQueryCategoryLabel(category) {
    return exports.sqlQueryCategories.find(candidate => candidate.value === category)?.label ?? category;
}
//# sourceMappingURL=queryCategory.js.map