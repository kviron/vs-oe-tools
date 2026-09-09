"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.valueClassesReferenceAttributeId = exports.defaultAttributeDistributionModeId = exports.defaultAttributeVisibilityId = exports.attributeDistributionClassId = exports.attributeVisibilityClassId = exports.attributeClassId = void 0;
exports.normalizeClassAttributeDraft = normalizeClassAttributeDraft;
exports.validateClassAttributeDraft = validateClassAttributeDraft;
exports.parseValueClassIds = parseValueClassIds;
exports.serializeClassAttributeAuditValues = serializeClassAttributeAuditValues;
exports.encodeAttributeAuditValues = encodeAttributeAuditValues;
const iconv = __importStar(require("iconv-lite"));
exports.attributeClassId = 4;
exports.attributeVisibilityClassId = 12450282;
exports.attributeDistributionClassId = 12450504;
exports.defaultAttributeVisibilityId = 12450284;
exports.defaultAttributeDistributionModeId = 12450505;
exports.valueClassesReferenceAttributeId = 1300;
const valueClassAttributeTypes = new Set([322, 324, 325, 330, 333]);
function normalizeClassAttributeDraft(draft) {
    return {
        ...draft,
        name: draft.name.trim(),
        aliases: draft.aliases.trim(),
        dbFieldName: draft.dbFieldName.trim(),
        valueClasses: parseValueClassIds(draft.valueClasses).join(','),
    };
}
function validateClassAttributeDraft(draft) {
    if (!Number.isSafeInteger(draft.ownerClassId) || draft.ownerClassId <= 0) {
        throw new Error('Класс-владелец должен иметь положительный ID.');
    }
    if (!draft.name.trim()) {
        throw new Error('Укажите имя атрибута.');
    }
    if (draft.name.trim().length > 250) {
        throw new Error('Имя атрибута не должно превышать 250 символов.');
    }
    if (draft.dbFieldName.trim() && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.dbFieldName.trim())) {
        throw new Error('Поле таблицы должно быть латинским SQL-идентификатором без пробелов.');
    }
    for (const [label, value] of [
        ['Тип атрибута', draft.attributeTypeId],
        ['Область видимости', draft.visibilityId],
        ['Режим дистрибуции', draft.distributionModeId],
    ]) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error(`${label} должен иметь положительный ID.`);
        }
    }
    if (!draft.virtual) {
        throw new Error('Пока поддерживается создание только виртуальных атрибутов: SQL-монитор не зафиксировал создание физической колонки.');
    }
    const valueClassIds = parseValueClassIds(draft.valueClasses);
    if (valueClassAttributeTypes.has(draft.attributeTypeId) && valueClassIds.length === 0) {
        throw new Error('Для выбранного типа укажите ID класса значения.');
    }
    assertWindows1251(draft.name, 'Имя');
    assertWindows1251(draft.aliases, 'Псевдоним');
}
function parseValueClassIds(value) {
    const normalized = value.trim();
    if (!normalized) {
        return [];
    }
    const ids = normalized.split(',').map(part => Number(part.trim()));
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('Классы значений должны быть перечислены положительными ID через запятую.');
    }
    return [...new Set(ids)];
}
function serializeClassAttributeAuditValues(input) {
    const draft = normalizeClassAttributeDraft(input);
    return [
        auditPair(102, draft.ownerClassId),
        auditPair(103, draft.name),
        auditPair(121, draft.aliases),
        auditPair(71, draft.visibilityId),
        ...(draft.dbFieldName ? [auditPair(112, draft.dbFieldName)] : []),
        auditPair(113, draft.attributeTypeId),
        auditPair(115, draft.isNotNull ? -1 : 0),
        auditPair(1300, draft.valueClasses),
        auditPair(1313, draft.distributionModeId),
        auditPair(1341, draft.virtual ? -1 : 0),
        auditPair(12450030, draft.refIntegrityCheck ? 1 : 0),
    ].join(',');
}
function encodeAttributeAuditValues(draft) {
    const value = serializeClassAttributeAuditValues(draft);
    const encoded = iconv.encode(value, 'win1251');
    if (iconv.decode(encoded, 'win1251') !== value) {
        throw new Error('Данные атрибута невозможно сохранить в Windows-1251.');
    }
    return encoded;
}
function auditPair(attributeId, value) {
    if (typeof value === 'number') {
        return `${attributeId},${value}`;
    }
    if (!/[",\r\n]/.test(value)) {
        return `${attributeId},${value}`;
    }
    return `${attributeId},"${value.replace(/"/g, '""')}"`;
}
function assertWindows1251(value, label) {
    const encoded = iconv.encode(value, 'win1251');
    if (iconv.decode(encoded, 'win1251') !== value) {
        throw new Error(`${label} содержит символы вне Windows-1251.`);
    }
}
//# sourceMappingURL=attributeCreation.js.map