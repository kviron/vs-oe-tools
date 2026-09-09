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
exports.defaultMethodCode = exports.defaultMethodKind = exports.interpretedMethodType = exports.defaultMethodVisibilityId = exports.methodClassId = void 0;
exports.normalizeClassMethodDraft = normalizeClassMethodDraft;
exports.validateClassMethodDraft = validateClassMethodDraft;
exports.serializeMethodCreationAuditValues = serializeMethodCreationAuditValues;
exports.encodeMethodCreationAuditValues = encodeMethodCreationAuditValues;
const iconv = __importStar(require("iconv-lite"));
const methodSignature_1 = require("../../infrastructure/database/methodSignature");
const changeValuesSerialization_1 = require("../../infrastructure/database/changeValuesSerialization");
exports.methodClassId = 5;
exports.defaultMethodVisibilityId = 12450286;
exports.interpretedMethodType = 3;
exports.defaultMethodKind = 0;
exports.defaultMethodCode = 'proc()\r\nbegin\r\n\r\nend;\r\n';
function normalizeClassMethodDraft(draft) {
    const code = draft.code.replace(/\r?\n/g, '\r\n');
    return {
        ...draft,
        name: draft.name.trim(),
        signature: (0, methodSignature_1.extractMethodSignature)(code) ?? draft.signature.trim(),
        code,
    };
}
function validateClassMethodDraft(input) {
    const draft = normalizeClassMethodDraft(input);
    if (!Number.isSafeInteger(draft.ownerClassId) || draft.ownerClassId <= 0) {
        throw new Error('Класс-владелец должен иметь положительный ID.');
    }
    if (!draft.name) {
        throw new Error('Укажите имя метода.');
    }
    if (draft.name.length > 250) {
        throw new Error('Имя метода не должно превышать 250 символов.');
    }
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(draft.name)) {
        throw new Error('Имя метода может содержать только буквы, цифры и знак подчёркивания.');
    }
    if (draft.methodType !== exports.interpretedMethodType) {
        throw new Error('Пока поддерживается создание только интерпретируемых методов (MethType=3).');
    }
    if (draft.methodKind !== exports.defaultMethodKind) {
        throw new Error('Пока поддерживается только обычный вид метода (MethKind=0).');
    }
    if (!Number.isSafeInteger(draft.visibilityId) || draft.visibilityId <= 0) {
        throw new Error('Область видимости должна иметь положительный ID.');
    }
    if (!draft.code.trim()) {
        throw new Error('Код метода не должен быть пустым.');
    }
    if (!(0, methodSignature_1.extractMethodSignature)(draft.code)) {
        throw new Error('Код метода должен начинаться с анонимного proc, procedure, func или function.');
    }
    assertWindows1251(draft.name, 'Имя');
    assertWindows1251(draft.signature, 'Сигнатура');
    assertWindows1251(draft.code, 'Код');
}
function serializeMethodCreationAuditValues(input) {
    const draft = normalizeClassMethodDraft(input);
    return [
        auditPair(103, draft.name),
        auditPair(71, draft.visibilityId),
        auditPair(123, draft.methodType),
        auditPair(1800, draft.methodKind),
        (0, changeValuesSerialization_1.serializeChangeValues)(draft.code, draft.ownerClassId, draft.signature),
    ].join(',');
}
function encodeMethodCreationAuditValues(input) {
    return iconv.encode(serializeMethodCreationAuditValues(input), 'win1251');
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
//# sourceMappingURL=methodCreation.js.map