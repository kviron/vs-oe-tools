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

	test('links IDs of at least five digits while leaving shorter and unsafe values alone', () => {
		const value = 'РИЦ 016, релиз 3.6, задача 85008, список 12345, значение 99999999999999999999.';
		assert.deepEqual(splitWorkDescriptionObjectIds(value), [
			{ text: 'РИЦ 016, релиз 3.6, задача ' },
			{ text: '85008', id: 85008, kind: 'task' },
			{ text: ', список ' },
			{ text: '12345', id: 12345, kind: 'object' },
			{ text: ', значение 99999999999999999999.' },
		]);
	});

	test('keeps one-digit database and task numbers as plain text', () => {
		assert.deepEqual(splitWorkDescriptionObjectIds('Объект 1, задача 2.'), [{ text: 'Объект 1, задача 2.' }]);
	});

	test('treats standalone five-digit numbers as tasks when requested', () => {
		assert.deepEqual(splitWorkDescriptionObjectIds('Исправлено по 88212 в 2026 году', 'task'), [
			{ text: 'Исправлено по ' },
			{ text: '88212', id: 88212, kind: 'task' },
			{ text: ' в 2026 году' },
		]);
	});
});
