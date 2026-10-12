import * as assert from 'node:assert/strict';
import { parsePlainWorkDescription } from '../features/production-tasks/plainWorkDescription';
import { splitWorkDescriptionObjectIds } from '../features/production-tasks/workDescriptionLinks';

suite('Plain production task description', () => {
	test('normalizes transport line breaks and retains paragraphs', () => {
		assert.deepEqual(parsePlainWorkDescription('Первая строка\\u000D\\u000AВторая\r\n\r\nАбзац'), [
			{ kind: 'paragraph', items: [{ text: 'Первая строка\nВторая' }] },
			{ kind: 'paragraph', items: [{ text: 'Абзац' }] },
		]);
	});
	test('preserves explicit numbering and continuation text', () => {
		assert.deepEqual(parsePlainWorkDescription('1.\n\nПервый пункт\nПродолжение\n3) Второй пункт'), [
			{ kind: 'ordered-list', items: [{ number: 1, text: 'Первый пункт\nПродолжение' }, { number: 3, text: 'Второй пункт' }] },
		]);
	});
	test('recognizes bullet lists without treating versions and filenames as markers', () => {
		const blocks = parsePlainWorkDescription('3.6 и 3.7\n<имя-файла> *обычный текст*\n\n- Поле А\n• Поле Б');
		assert.equal(blocks[0].kind, 'paragraph');
		assert.equal(blocks[0].items[0].text, '3.6 и 3.7\n<имя-файла> *обычный текст*');
		assert.deepEqual(blocks[1], { kind: 'unordered-list', items: [{ text: 'Поле А' }, { text: 'Поле Б' }] });
	});
	test('retains the existing task, object and URL link classification in list items', () => {
		const item = parsePlainWorkDescription('1. Задача 89328, объект 952507978, https://r.oe-it.ru/89328')[0].items[0];
		const parts = splitWorkDescriptionObjectIds(item.text);
		assert.equal(parts.find(part => part.id === 89328)?.kind, 'task');
		assert.equal(parts.find(part => part.id === 952507978)?.kind, 'object');
		assert.equal(parts.find(part => part.href)?.href, 'https://r.oe-it.ru/89328');
	});
});
