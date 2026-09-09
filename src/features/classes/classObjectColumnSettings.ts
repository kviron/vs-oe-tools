import type { ClassObjectColumnSettings } from './models';

const storagePrefix = 'vcVeTools.classObjectColumnSettings';

export function classObjectColumnSettingsKey(classId: number): string {
	return `${storagePrefix}.${classId}`;
}

export function normalizeClassObjectColumnSettings(
	availableColumnKeys: readonly string[],
	stored?: unknown,
): ClassObjectColumnSettings {
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

function isSettingsCandidate(value: unknown): value is Partial<ClassObjectColumnSettings> {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (!('visible' in candidate) || Array.isArray(candidate.visible))
		&& (!('order' in candidate) || Array.isArray(candidate.order))
		&& (!('compact' in candidate) || typeof candidate.compact === 'boolean');
}

function uniqueStrings(values: readonly unknown[]): string[] {
	return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}
