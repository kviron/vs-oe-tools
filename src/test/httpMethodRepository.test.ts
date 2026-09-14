import * as assert from 'assert';
import * as iconv from 'iconv-lite';
import { decodeHttpText } from '../features/http-api/httpMethodRepository';

suite('HTTP method repository', () => {
	test('decodes method metadata stored in Windows-1251', () => {
		const signature = '(парПравило: Integer; парДопПараметры: wDynamicStorage): Integer';
		assert.equal(decodeHttpText(iconv.encode(signature, 'win1251')), signature);
	});

	test('keeps text and empty database values intact', () => {
		assert.equal(decodeHttpText('(): Integer'), '(): Integer');
		assert.equal(decodeHttpText(null), '');
	});
});
