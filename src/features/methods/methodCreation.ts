import * as iconv from 'iconv-lite';
import type { ClassMethodDraft } from '../classes/models';
import { extractMethodSignature } from '../../infrastructure/database/methodSignature';
import { serializeChangeValues } from '../../infrastructure/database/changeValuesSerialization';

export const methodClassId = 5;
export const defaultMethodVisibilityId = 12450286;
export const interpretedMethodType = 3 as const;
export const defaultMethodKind = 0 as const;
export const classProcedureMethodKind = 6 as const;
export const defaultMethodCode = 'proc()\r\nbegin\r\n\r\nend;\r\n';

export function normalizeClassMethodDraft(draft: ClassMethodDraft): ClassMethodDraft {
	const code = draft.code.replace(/\r?\n/g, '\r\n');
	return {
		...draft,
		name: draft.name.trim(),
		signature: extractMethodSignature(code) ?? draft.signature.trim(),
		code,
	};
}

export function validateClassMethodDraft(input: ClassMethodDraft): void {
	const draft = normalizeClassMethodDraft(input);
	// The legacy validation below accepts the ordinary kind. Validate class
	// procedures through the same persistence path without rewriting the input.
	if (draft.methodKind === classProcedureMethodKind) { draft.methodKind = defaultMethodKind; }
	if (!Number.isSafeInteger(draft.ownerClassId) || draft.ownerClassId <= 0) { throw new Error('Класс-владелец должен иметь положительный ID.'); }
	if (!draft.name) { throw new Error('Укажите имя метода.'); }
	if (draft.name.length > 250) { throw new Error('Имя метода не должно превышать 250 символов.'); }
	if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(draft.name)) { throw new Error('Имя метода может содержать только буквы, цифры и знак подчёркивания.'); }
	if (draft.methodType !== interpretedMethodType) { throw new Error('Пока поддерживается создание только интерпретируемых методов (MethType=3).'); }
	if (draft.methodKind !== defaultMethodKind) { throw new Error('Пока поддерживается только обычный вид метода (MethKind=0).'); }
	if (!Number.isSafeInteger(draft.visibilityId) || draft.visibilityId <= 0) { throw new Error('Область видимости должна иметь положительный ID.'); }
	if (!draft.code.trim()) { throw new Error('Код метода не должен быть пустым.'); }
	if (!extractMethodSignature(draft.code)) { throw new Error('Код метода должен начинаться с анонимного proc, procedure, func или function.'); }
	assertWindows1251(draft.name, 'Имя');
	assertWindows1251(draft.signature, 'Сигнатура');
	assertWindows1251(draft.code, 'Код');
}

export function serializeMethodCreationAuditValues(input: ClassMethodDraft): string {
	const draft = normalizeClassMethodDraft(input);
	return [
		auditPair(103, draft.name),
		auditPair(71, draft.visibilityId),
		auditPair(123, draft.methodType),
		auditPair(1800, draft.methodKind),
		serializeChangeValues(draft.code, draft.ownerClassId, draft.signature),
	].join(',');
}

export function encodeMethodCreationAuditValues(input: ClassMethodDraft): Buffer {
	return iconv.encode(serializeMethodCreationAuditValues(input), 'win1251');
}

function auditPair(attributeId: number, value: string | number): string {
	if (typeof value === 'number') { return `${attributeId},${value}`; }
	if (!/[",\r\n]/.test(value)) { return `${attributeId},${value}`; }
	return `${attributeId},"${value.replace(/"/g, '""')}"`;
}

function assertWindows1251(value: string, label: string): void {
	const encoded = iconv.encode(value, 'win1251');
	if (iconv.decode(encoded, 'win1251') !== value) { throw new Error(`${label} содержит символы вне Windows-1251.`); }
}
