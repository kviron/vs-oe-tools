import * as assert from 'assert';
import { parseHttpMethodDocumentation } from '../features/http-api/httpParameterDocumentation';

suite('HTTP parameter documentation', () => {
	test('extracts reference annotations and keeps the public description', () => {
		const result = parseHttpMethodDocumentation(`Возвращает фотографию личности.

@param {Личность} парИдЛичности Идентификатор личности
@param {Документ} парДокументИд`);

		assert.strictEqual(result.description, 'Возвращает фотографию личности.');
		assert.deepStrictEqual(result.parameters.get('паридличности'), {
			name: 'парИдЛичности',
			referenceType: 'Личность',
			description: 'Идентификатор личности',
		});
		assert.strictEqual(result.parameters.get('пардокументид')?.referenceType, 'Документ');
	});

	test('leaves ordinary and malformed description lines untouched', () => {
		const source = 'Описание метода.\n@param Личность парИдЛичности';
		const result = parseHttpMethodDocumentation(source);

		assert.strictEqual(result.description, source);
		assert.strictEqual(result.parameters.size, 0);
	});
});
