import * as iconv from 'iconv-lite';
import type { ClassAttributeDraft } from './models';

export const attributeClassId = 4;
export const attributeVisibilityClassId = 12450282;
export const attributeDistributionClassId = 12450504;
export const defaultAttributeVisibilityId = 12450284;
export const defaultAttributeDistributionModeId = 12450505;
export const valueClassesReferenceAttributeId = 1300;

const valueClassAttributeTypes = new Set([322, 324, 325, 330, 333]);

export function normalizeClassAttributeDraft(draft: ClassAttributeDraft): ClassAttributeDraft {
	return {
		...draft,
		name: draft.name.trim(),
		aliases: draft.aliases.trim(),
		dbFieldName: draft.dbFieldName.trim(),
		valueClasses: parseValueClassIds(draft.valueClasses).join(','),
	};
}

export function validateClassAttributeDraft(draft: ClassAttributeDraft): void {
	if (!Number.isSafeInteger(draft.ownerClassId) || draft.ownerClassId <= 0) { throw new Error('Класс-владелец должен иметь положительный ID.'); }
	if (!draft.name.trim()) { throw new Error('Укажите имя атрибута.'); }
	if (draft.name.trim().length > 250) { throw new Error('Имя атрибута не должно превышать 250 символов.'); }
	if (draft.dbFieldName.trim() && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.dbFieldName.trim())) {
		throw new Error('Поле таблицы должно быть латинским SQL-идентификатором без пробелов.');
	}
	for (const [label, value] of [
		['Тип атрибута', draft.attributeTypeId],
		['Область видимости', draft.visibilityId],
		['Режим дистрибуции', draft.distributionModeId],
	] as const) {
		if (!Number.isSafeInteger(value) || value <= 0) { throw new Error(`${label} должен иметь положительный ID.`); }
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

export function parseValueClassIds(value: string): number[] {
	const normalized = value.trim();
	if (!normalized) { return []; }
	const ids = normalized.split(',').map(part => Number(part.trim()));
	if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
		throw new Error('Классы значений должны быть перечислены положительными ID через запятую.');
	}
	return [...new Set(ids)];
}

export function serializeClassAttributeAuditValues(input: ClassAttributeDraft): string {
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

export function encodeAttributeAuditValues(draft: ClassAttributeDraft): Buffer {
	const value = serializeClassAttributeAuditValues(draft);
	const encoded = iconv.encode(value, 'win1251');
	if (iconv.decode(encoded, 'win1251') !== value) { throw new Error('Данные атрибута невозможно сохранить в Windows-1251.'); }
	return encoded;
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
