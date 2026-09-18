import type { DatabaseObjectSearchResult } from '../../core/objectSearch';
import type { ProductionTaskSummary } from '../production-tasks/models';
import type { PackageSummary } from '../packages/models';

export interface ClipboardObjectNavigationActions {
	findById(id: number): Promise<DatabaseObjectSearchResult | undefined>;
	findTaskByReference(reference: number): Promise<ProductionTaskSummary | undefined>;
	searchObjects(query: string): Promise<DatabaseObjectSearchResult[]>;
	searchTasks(query: string): Promise<ProductionTaskSummary[]>;
	searchPackages(query: string): Promise<PackageSummary[]>;
	revealClass(id: number): Promise<void>;
	openClass(id: number): Promise<void>;
	openClassObjects(id: number): Promise<void>;
	revealMethod(classId: number, methodId: number): Promise<void>;
	openAttribute(classId: number, attributeId: number): Promise<void>;
	openDictionary(classId: number, objectId: number): Promise<void>;
	openMethod(methodId: number): Promise<void>;
	openModule(moduleId: number): Promise<void>;
	openObject(objectId: number): Promise<void>;
	openHistory(object: DatabaseObjectSearchResult): Promise<void>;
	openTask(task: ProductionTaskSummary): Promise<void>;
	revealPackage(id: number): Promise<void>;
}

export type ClipboardNavigationTarget = 'explorer' | 'object' | 'objectView' | 'classObjects';
export type ClipboardNavigationMatch =
	| { kind: 'object'; object: DatabaseObjectSearchResult }
	| { kind: 'task'; task: ProductionTaskSummary }
	| { kind: 'package'; package: PackageSummary };

export interface ClipboardNavigationSearchResult {
	matches: ClipboardNavigationMatch[];
	errors: string[];
}

interface SettledSearchResult<T> {
	values: T[];
	error?: string;
}

export function parseClipboardObjectId(value: string): number | undefined {
	const trimmed = value.trim();
	if (!/^\d(?:[\d\s]*\d)?$/.test(trimmed)) {
		return undefined;
	}
	const id = Number(trimmed.replace(/\s/g, ''));
	return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function parseClipboardNavigationQuery(value: string): string | undefined {
	const directId = parseClipboardObjectId(value);
	if (directId !== undefined) { return String(directId); }
	const trimmed = value.trim();
	const assignment = trimmed.match(/^(?:id|ид)\s*[:=]\s*(\d(?:[\d\s]*\d)?)$/iu);
	if (assignment) { return String(Number(assignment[1].replace(/\s/g, ''))); }
	try {
		const url = new URL(trimmed);
		if (url.hostname.toLocaleLowerCase('en-US') === 'r.oe-it.ru') {
			const reference = url.pathname.match(/\/(\d+)(?:\/|$)/u)?.[1];
			if (reference) { return String(Number(reference)); }
		}
	} catch { /* Clipboard contents are commonly not a URL. */ }
	const entityUri = trimmed.match(/^oe-[^:\s]+:\/{1,2}[^?#\s]*\/(\d+)(?:[?#]|$)/iu);
	return entityUri ? String(Number(entityUri[1])) : undefined;
}

export async function findClipboardNavigationMatch(id: number, actions: ClipboardObjectNavigationActions): Promise<ClipboardNavigationMatch | undefined> {
	const object = await actions.findById(id);
	if (object) { return { kind: 'object', object }; }
	let task: ProductionTaskSummary | undefined;
	let taskError: unknown;
	try {
		task = await actions.findTaskByReference(id);
	} catch (error) {
		taskError = error;
	}
	if (task) { return { kind: 'task', task }; }
	try {
		const packageValue = (await actions.searchPackages(String(id)))[0];
		if (packageValue) { return { kind: 'package', package: packageValue }; }
	} catch (packageError) {
		if (!taskError) { throw packageError; }
		throw new Error(`Не удалось проверить задачи и пакеты: ${errorMessage(taskError)}; ${errorMessage(packageError)}`);
	}
	if (taskError) { throw taskError; }
	return undefined;
}

export async function searchLocalClipboardNavigation(query: string, actions: ClipboardObjectNavigationActions): Promise<ClipboardNavigationSearchResult> {
	const normalized = query.trim();
	if (!normalized) { return { matches: [], errors: [] }; }
	const [objectResult, packageResult] = await Promise.all([
		settled('объекты', () => actions.searchObjects(normalized)),
		settled('пакеты', () => actions.searchPackages(normalized)),
	]);
	return {
		matches: [
			...objectResult.values.map(object => ({ kind: 'object' as const, object })),
			...packageResult.values.map(packageValue => ({ kind: 'package' as const, package: packageValue })),
		],
		errors: errorsOf(objectResult, packageResult),
	};
}

export async function searchTaskClipboardNavigation(query: string, actions: ClipboardObjectNavigationActions): Promise<ClipboardNavigationSearchResult> {
	const normalized = query.trim();
	if (!normalized) { return { matches: [], errors: [] }; }
	const result = await settled('задачи', () => actions.searchTasks(normalized));
	return {
		matches: result.values.map(task => ({ kind: 'task', task })),
		errors: errorsOf(result),
	};
}

async function settled<T>(source: string, action: () => Promise<T[]>): Promise<SettledSearchResult<T>> {
	try { return { values: await action() }; }
	catch (error) { return { values: [], error: `${source}: ${errorMessage(error)}` }; }
}

function errorsOf(...results: SettledSearchResult<unknown>[]): string[] {
	return results.flatMap(result => result.error ? [result.error] : []);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function navigateToDatabaseObject(object: DatabaseObjectSearchResult, target: ClipboardNavigationTarget, actions: ClipboardObjectNavigationActions): Promise<void> {
	const id = requireId(object.id, 'объекта');
	if (target === 'objectView') {
		await actions.openObject(id);
		return;
	}
	if (target === 'classObjects') {
		if (object.kind !== 'class') {
			throw new Error('Просмотр объектов доступен только для класса.');
		}
		await actions.openClassObjects(id);
		return;
	}
	if (target === 'object') {
		if (object.kind === 'class') {
			await actions.openClass(id);
		} else if (object.kind === 'method') {
			await actions.openMethod(id);
		} else if (object.kind === 'module') {
			await actions.openModule(id);
		} else if (object.kind === 'attribute') {
			await actions.openAttribute(requireId(object.seniorId, 'родительского класса'), id);
		} else {
			await actions.openObject(id);
		}
		return;
	}
	if (object.kind === 'class') {
		await actions.revealClass(id);
		await actions.openClass(id);
		return;
	}
	if (object.kind === 'method') {
		await actions.revealMethod(requireId(object.seniorId, 'родительского класса'), id);
		return;
	}
	if (object.kind === 'module') {
		await actions.openModule(id);
		return;
	}
	if (object.kind === 'attribute') {
		await actions.revealClass(requireId(object.seniorId, 'родительского класса'));
		return;
	}
	await actions.openDictionary(requireId(object.classId, 'класса справочника'), id);
}

function requireId(value: string | null, description: string): number {
	const id = value === null ? Number.NaN : Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new Error(`Не удалось определить ID ${description}.`);
	}
	return id;
}
