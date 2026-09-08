import * as assert from 'node:assert/strict';
import { splitWorkDescriptionObjectIds } from '../features/production-tasks/workDescriptionLinks';

suite('Production task work description links', () => {
	test('extracts East Express object IDs and preserves surrounding text', () => {
		assert.deepEqual(splitWorkDescriptionObjectIds('Класс 12857713 и метод 3200110.'), [
			{ text: 'Класс ' },
			{ text: '12857713', id: 12857713, kind: 'object' },
			{ text: ' и метод ' },
			{ text: '3200110', id: 3200110, kind: 'object' },
			{ text: '.' },
		]);
	});

	test('recognizes explicit task IDs and web links', () => {
		assert.deepEqual(splitWorkDescriptionObjectIds('Задача ID 934593105: https://example.test/info.'), [
			{ text: 'Задача ID ' },
			{ text: '934593105', id: 934593105, kind: 'task' },
			{ text: ': ' },
			{ text: 'https://example.test/info', href: 'https://example.test/info' },
			{ text: '.' },
		]);
	});

	test('does not link task numbers, releases, list numbers, or unsafe integers', () => {
		const value = 'РИЦ 016, релиз 3.6, задача 85008, значение 99999999999999999999.';
		assert.deepEqual(splitWorkDescriptionObjectIds(value), [{ text: value }]);
	});
});
