import type { DatabaseObjectSearchResult } from '../../core/objectSearch';

export interface ClipboardObjectNavigationActions {
	findById(id: number): Promise<DatabaseObjectSearchResult | undefined>;
	revealClass(id: number): Promise<void>;
	openClass(id: number): Promise<void>;
	revealMethod(classId: number, methodId: number): Promise<void>;
	openAttribute(classId: number, attributeId: number): Promise<void>;
	openDictionary(classId: number): Promise<void>;
	openMethod(methodId: number): Promise<void>;
	openObject(objectId: number): Promise<void>;
}

export type ClipboardNavigationTarget = 'explorer' | 'object';

export function parseClipboardObjectId(value: string): number | undefined {
	const trimmed = value.trim();
	if (!/^\d(?:[\d\s]*\d)?$/.test(trimmed)) {
		return undefined;
	}
	const id = Number(trimmed.replace(/\s/g, ''));
	return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export async function navigateToDatabaseObject(object: DatabaseObjectSearchResult, target: ClipboardNavigationTarget, actions: ClipboardObjectNavigationActions): Promise<void> {
	const id = requireId(object.id, 'объекта');
	if (target === 'object') {
		if (object.kind === 'class') {
			await actions.openClass(id);
		} else if (object.kind === 'method') {
			await actions.openMethod(id);
		} else if (object.kind === 'attribute') {
			await actions.openAttribute(requireId(object.seniorId, 'родительского класса'), id);
		} else {
			await actions.openObject(id);
		}
		return;
	}
	if (object.kind === 'class') {
		await actions.revealClass(id);
		return;
	}
	if (object.kind === 'method') {
		await actions.revealMethod(requireId(object.seniorId, 'родительского класса'), id);
		return;
	}
	if (object.kind === 'attribute') {
		await actions.revealClass(requireId(object.seniorId, 'родительского класса'));
		return;
	}
	await actions.openDictionary(requireId(object.classId, 'класса справочника'));
}

function requireId(value: string | null, description: string): number {
	const id = value === null ? Number.NaN : Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new Error(`Не удалось определить ID ${description}.`);
	}
	return id;
}
