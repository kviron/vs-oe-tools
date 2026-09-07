import type { SpuDraft } from './models';

export const spuClassId = 12609684;
export const sysFileClassId = 68725;
export const defaultSpuTypeId = 10200541;
export const spuIdRangeSize = 1_000_000;
export const spuIdRangeMinimum = 20_000_001;

export function validateSpuDraft(draft: SpuDraft): void {
	if (!draft.name.trim()) { throw new Error('Укажите наименование SPU.'); }
	if (!Number.isSafeInteger(draft.packageId) || draft.packageId <= 0) { throw new Error('Выберите пакет SPU.'); }
	if (!Number.isSafeInteger(draft.typeId) || draft.typeId <= 0) { throw new Error('Выберите тип SPU.'); }
	if (!draft.executionOrder.trim() || Number.isNaN(Date.parse(draft.executionOrder))) { throw new Error('Укажите корректный порядок выполнения.'); }
	if (!Number.isSafeInteger(draft.beginVersion) || draft.beginVersion < 0) { throw new Error('Начальная версия должна быть целым неотрицательным числом.'); }
	assertWindows1251(draft.name, 'Наименование');
	assertWindows1251(draft.sqlScript, 'SQL-скрипт');
	assertWindows1251(draft.comment, 'Комментарий');
}

export function buildSpuFileName(name: string): string {
	return `SPU_${name.trim()}`;
}

export function getAutomaticIdRangeStart(referenceId: number): number {
	if (!Number.isSafeInteger(referenceId) || referenceId < spuIdRangeMinimum) {
		throw new Error('Не удалось определить диапазон ID этой рабочей станции.');
	}
	return Math.floor((referenceId - 1) / spuIdRangeSize) * spuIdRangeSize + 1;
}

export function serializeSpuAuditValues(draft: SpuDraft, beginVersion: number): string {
	const values = auditFields(draft, beginVersion)
		.filter(field => field.value !== null && field.value !== '')
		.map(field => auditPair(field.attributeId, field.value));
	return values.join(',');
}

export function serializeSpuAuditChanges(
	previous: SpuDraft,
	next: SpuDraft,
	previousBeginVersion: number,
	nextBeginVersion: number,
): { oldValues: string; newValues: string } {
	const oldFields = auditFields(previous, previousBeginVersion);
	const newFields = auditFields(next, nextBeginVersion);
	const oldValues: string[] = [];
	const newValues: string[] = [];
	for (let index = 0; index < oldFields.length; index++) {
		if (oldFields[index].value === newFields[index].value) { continue; }
		oldValues.push(auditPair(oldFields[index].attributeId, oldFields[index].value));
		newValues.push(auditPair(newFields[index].attributeId, newFields[index].value));
	}
	return { oldValues: oldValues.join(','), newValues: newValues.join(',') };
}

function auditFields(draft: SpuDraft, beginVersion: number): Array<{ attributeId: number; value: string | number | null }> {
	return [
		{ attributeId: 103, value: draft.name.trim() },
		{ attributeId: 4029346, value: formatLegacyDateTime(draft.executionOrder) },
		{ attributeId: 10200538, value: draft.typeId },
		{ attributeId: 12609686, value: beginVersion },
		{ attributeId: 12609688, value: draft.isAfterUpdate ? -1 : null },
		{ attributeId: 12933885, value: draft.executeAlways ? -1 : null },
		{ attributeId: 12609690, value: draft.sqlScript },
		{ attributeId: 12609689, value: draft.comment },
	];
}

function auditPair(attributeId: number, value: string | number | null): string {
	if (value === null) { return `${attributeId},`; }
	if (typeof value === 'number') { return `${attributeId},${value}`; }
	return `${attributeId},"${value.replace(/"/g, '""')}"`;
}

function assertWindows1251(value: string, label: string): void {
	// Every non-ASCII character used by the editor must fit the legacy database encoding.
	// iconv-lite performs the definitive round-trip again immediately before persistence.
	if (value.includes('\uFFFD')) { throw new Error(`${label} содержит повреждённый символ Unicode.`); }
}

function formatLegacyDateTime(value: string): string {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
	if (!match) { return value; }
	return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}:${match[6] ?? '00'}`;
}
