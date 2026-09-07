import * as assert from 'node:assert/strict';
import type { DatabaseObjectSearchResult } from '../core/objectSearch';
import { navigateToDatabaseObject, parseClipboardObjectId, type ClipboardObjectNavigationActions } from '../features/explorer/clipboardObjectRouting';

suite('Clipboard object navigation', () => {
	test('parses raw and visually grouped IDs', () => {
		assert.equal(parseClipboardObjectId('10654528'), 10654528);
		assert.equal(parseClipboardObjectId('10 654 528\r\n'), 10654528);
		assert.equal(parseClipboardObjectId('ID=10654528'), undefined);
		assert.equal(parseClipboardObjectId('0'), undefined);
	});

	test('reveals a method in its owning class', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', seniorId: '20', kind: 'method' }), 'explorer', actions(calls));
		assert.deepEqual(calls, ['revealMethod:20:25']);
	});

	test('opens a dictionary for a regular object', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', classId: '5', kind: 'object' }), 'explorer', actions(calls));
		assert.deepEqual(calls, ['openDictionary:5']);
	});

	test('opens a method editor when the object itself is selected', async () => {
		const calls: string[] = [];
		await navigateToDatabaseObject(object({ id: '25', seniorId: '20', kind: 'method' }), 'object', actions(calls));
		assert.deepEqual(calls, ['openMethod:25']);
	});
});

function object(overrides: Partial<DatabaseObjectSearchResult>): DatabaseObjectSearchResult {
	return { id: '1', classId: '2', seniorId: null, name: '', metaClassName: '', ownerName: '', ownerId: null, ownerClassName: '', packageName: '', bitmapId: null, kind: 'object', ...overrides };
}

function actions(calls: string[]): ClipboardObjectNavigationActions {
	return {
		findById: async () => undefined,
		revealClass: async id => { calls.push(`revealClass:${id}`); },
		openClass: async id => { calls.push(`openClass:${id}`); },
		revealMethod: async (classId, methodId) => { calls.push(`revealMethod:${classId}:${methodId}`); },
		openAttribute: async (classId, attributeId) => { calls.push(`openAttribute:${classId}:${attributeId}`); },
		openDictionary: async id => { calls.push(`openDictionary:${id}`); },
		openMethod: async id => { calls.push(`openMethod:${id}`); },
		openObject: async id => { calls.push(`openObject:${id}`); },
	};
}
