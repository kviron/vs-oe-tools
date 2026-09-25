import * as assert from 'node:assert/strict';
import { hasMethodCompilationResult, parseMethodCompilationOutput } from '../features/methods/methodCompilation';

suite('Method compilation diagnostics', () => {
	test('parses compiler errors and warnings with one-based lines', () => {
		assert.deepEqual(parseMethodCompilationOutput([
			'ОШИБКА  стр. 07:  Неизвестный идентификатор Foo',
			'стр. 12:  Переменная Bar не используется',
		].join('\r\n')), [
			{ line: 7, message: 'Неизвестный идентификатор Foo', severity: 'error' },
			{ line: 12, message: 'Переменная Bar не используется', severity: 'warning' },
		]);
	});

	test('ignores OEExecTask service output', () => {
		assert.deepEqual(parseMethodCompilationOutput('Консольный исполнитель задач\r\nVCVE_COMPILE_OK'), []);
		assert.equal(hasMethodCompilationResult('Консольный исполнитель задач\r\nПодключаемся к серверу: localhost'), false);
		assert.equal(hasMethodCompilationResult('Консольный исполнитель задач\r\nVCVE_COMPILE_OK'), true);
		assert.equal(hasMethodCompilationResult('ОШИБКА  стр. 07:  Неизвестный идентификатор Foo'), true);
	});
});
