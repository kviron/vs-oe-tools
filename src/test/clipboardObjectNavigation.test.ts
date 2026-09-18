import * as assert from 'node:assert/strict';
import type { DatabaseObjectSearchResult } from '../core/objectSearch';
import { findClipboardNavigationMatch, navigateToDatabaseObject, parseClipboardNavigationQuery, parseClipboardObjectId, searchLocalClipboardNavigation, searchTaskClipboardNavigation, type ClipboardObjectNavigationActions } from '../features/explorer/clipboardObjectRouting';
import type { ProductionTaskSummary } from '../features/production-tasks/models';

suite('Clipboard object navigation', () => {
	test('parses raw and visually grouped IDs', () => {
		assert.equal(parseClipboardObjectId('10654528'), 10654528);
		assert.equal(parseClipboardObjectId('10 654 528\r\n'), 10654528);
		assert.equal(parseClipboardObjectId('ID=10654528'), undefined);
		assert.equal(parseClipboardObjectId('0'), undefined);
	});

	test('extracts navigation queries from IDs and task links', () => {
		assert.equal(parseClipboardNavigationQuery('ID=10 654 528'), '10654528');
		assert.equal(parseClipboardNavigationQuery('https://r.oe-it.ru/88212'), '88212');
		assert.equal(parseClipboardNavigationQuery('oe-oetrunk:/open/Метод/3200176'), '3200176');
		assert.equal(parseClipboardNavigationQuery('ordinary clipboard text'), undefined);
	});

	test('reveals a method in its owning class', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', seniorId: '20', kind: 'method' }), 'explorer', actions(calls));
		assert.deepEqual(calls, ['revealMethod:20:25']);
	});

	test('reveals a class and opens its card', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', kind: 'class' }), 'explorer', actions(calls));
		assert.deepEqual(calls, ['revealClass:25', 'openClass:25']);
	});

	test('opens the object table for a class', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', kind: 'class' }), 'classObjects', actions(calls));
		assert.deepEqual(calls, ['openClassObjects:25']);
	});

	test('rejects the object table target for a non-class object', async () => {
		await assert.rejects(
			navigateToDatabaseObject(object({ id: '25', kind: 'method' }), 'classObjects', actions([])),
			/только для класса/u,
		);
	});

	test('opens a dictionary for a regular object', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', classId: '5', kind: 'object' }), 'explorer', actions(calls));
		assert.deepEqual(calls, ['openDictionary:5:25']);
	});

	test('opens a method editor when the object itself is selected', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', seniorId: '20', kind: 'method' }), 'object', actions(calls));
		assert.deepEqual(calls, ['openMethod:25']);
	});

	test('opens a module editor for every module object', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', seniorId: '20', kind: 'module' }), 'object', actions(calls));
		assert.deepEqual(calls, ['openModule:25']);
	});

	test('opens the universal object view for every database object kind', async () => {
		for (const kind of ['class', 'method', 'attribute', 'object'] as const) {
			const calls: string[] = [];
			await navigateToDatabaseObject(object({ id: '25', kind }), 'objectView', actions(calls));
			assert.deepEqual(calls, ['openObject:25']);
		}
	});

	test('searches a task only when no database object was found', async () => {
		const calls: string[] = [];
		const task = productionTask({ id: 900000001, number: '88212' });
		const navigationActions = actions(calls, undefined, task);
		const match = await findClipboardNavigationMatch(88212, navigationActions);
		assert.deepEqual(match, { kind: 'task', task });
		assert.deepEqual(calls, ['findObject:88212', 'findTask:88212']);
	});

	test('does not search a task when a database object was found', async () => {
		const calls: string[] = [];
		const foundObject = object({ id: '88212' });
		const match = await findClipboardNavigationMatch(88212, actions(calls, foundObject));
		assert.deepEqual(match, { kind: 'object', object: foundObject });
		assert.deepEqual(calls, ['findObject:88212']);
	});

	test('finds a package after object and task fallbacks', async () => {
		const calls: string[] = [];
		const navigationActions = actions(calls);
		navigationActions.searchPackages = async query => { calls.push(`searchPackages:${query}`); return [{ id: 77, name: 'Package' }]; };
		const match = await findClipboardNavigationMatch(77, navigationActions);
		assert.deepEqual(match, { kind: 'package', package: { id: 77, name: 'Package' } });
		assert.deepEqual(calls, ['findObject:77', 'findTask:77', 'searchPackages:77']);
	});

	test('still finds a package when task lookup fails', async () => {
		const calls: string[] = [];
		const navigationActions = actions(calls);
		navigationActions.findTaskByReference = async id => { calls.push(`findTask:${id}`); throw new Error('OENP unavailable'); };
		navigationActions.searchPackages = async query => { calls.push(`searchPackages:${query}`); return [{ id: 77, name: 'Package' }]; };
		const match = await findClipboardNavigationMatch(77, navigationActions);
		assert.deepEqual(match, { kind: 'package', package: { id: 77, name: 'Package' } });
		assert.deepEqual(calls, ['findObject:77', 'findTask:77', 'searchPackages:77']);
	});

	test('searches local sources independently from tasks', async () => {
		const calls: string[] = [];
		const foundObject = object({ id: '88212' });
		const task = productionTask({ id: 900000001, number: '88212' });
		const navigationActions = actions(calls, undefined, undefined, [foundObject], [task]);
		const local = await searchLocalClipboardNavigation('88212', navigationActions);
		assert.deepEqual(local.matches, [{ kind: 'object', object: foundObject }]);
		assert.deepEqual(calls, ['searchObjects:88212', 'searchPackages:88212']);
		const remote = await searchTaskClipboardNavigation('88212', navigationActions);
		assert.deepEqual(remote.matches, [{ kind: 'task', task }]);
		assert.deepEqual(calls, ['searchObjects:88212', 'searchPackages:88212', 'searchTasks:88212']);
	});
});

function object(overrides: Partial<DatabaseObjectSearchResult>): DatabaseObjectSearchResult {
	return { id: '1', classId: '2', seniorId: null, name: '', metaClassName: '', ownerName: '', ownerId: null, ownerClassName: '', packageName: '', bitmapId: null, kind: 'object', ...overrides };
}

function productionTask(overrides: Partial<ProductionTaskSummary>): ProductionTaskSummary {
	return {
		id: 1, number: '', state: '', title: '', createdAt: '', deadline: '', activityKind: '', workType: '', project: '',
		author: '', manager: '', analyst: '', executor: '', responsibleUser: '', responsibleUserId: 0, reviewer: '', appeal: '',
		packageName: '', newsSection: '', priority: '', effort: '', releasePlan: '', releaseActual: '', revisionTrunk: '',
		revisionBranch: '', attachmentCount: 0, workDescription: '', stateComment: '', stateCommentAuthor: '', ...overrides,
	};
}

function actions(calls: string[], foundObject?: DatabaseObjectSearchResult, foundTask?: ProductionTaskSummary,
	objects: DatabaseObjectSearchResult[] = [], tasks: ProductionTaskSummary[] = []): ClipboardObjectNavigationActions {
	return {
		findById: async id => { calls.push(`findObject:${id}`); return foundObject; },
		findTaskByReference: async id => { calls.push(`findTask:${id}`); return foundTask; },
		searchObjects: async query => { calls.push(`searchObjects:${query}`); return objects; },
		searchTasks: async query => { calls.push(`searchTasks:${query}`); return tasks; },
		searchPackages: async query => { calls.push(`searchPackages:${query}`); return []; },
		revealClass: async id => { calls.push(`revealClass:${id}`); },
		openClass: async id => { calls.push(`openClass:${id}`); },
		openClassObjects: async id => { calls.push(`openClassObjects:${id}`); },
		revealMethod: async (classId, methodId) => { calls.push(`revealMethod:${classId}:${methodId}`); },
		openAttribute: async (classId, attributeId) => { calls.push(`openAttribute:${classId}:${attributeId}`); },
		openDictionary: async (classId, objectId) => { calls.push(`openDictionary:${classId}:${objectId}`); },
		openMethod: async id => { calls.push(`openMethod:${id}`); },
		openModule: async id => { calls.push(`openModule:${id}`); },
		openObject: async id => { calls.push(`openObject:${id}`); },
		openHistory: async value => { calls.push(`openHistory:${value.id}`); },
		openTask: async task => { calls.push(`openTask:${task.id}`); },
		revealPackage: async id => { calls.push(`revealPackage:${id}`); },
	};
}
