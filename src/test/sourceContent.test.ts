import * as assert from 'node:assert/strict';
import * as iconv from 'iconv-lite';
import { createSourceExcerpt, decodeSourceValue, maximumSourceLineLimit } from '../mcp/sourceContent';

suite('MCP source content', () => {
	test('decodes Windows-1251 buffers and PostgreSQL bytea text', () => {
		const source = 'процедура Проверка';
		const encoded = iconv.encode(source, 'win1251');
		assert.equal(decodeSourceValue(encoded), source);
		assert.equal(decodeSourceValue(`\\x${encoded.toString('hex')}`), source);
	});

	test('returns a numbered, pageable excerpt', () => {
		const excerpt = createSourceExcerpt('one\ntwo\nthree\nfour', 2, 2);
		assert.deepEqual(excerpt, {
			text: '2 | two\n3 | three',
			totalLines: 4,
			startLine: 2,
			endLine: 3,
			truncated: true,
		});
	});

	test('caps the number of returned lines', () => {
		const source = Array.from({ length: maximumSourceLineLimit + 2 }, (_, index) => String(index)).join('\n');
		const excerpt = createSourceExcerpt(source, 1, maximumSourceLineLimit + 100);
		assert.equal(excerpt.endLine, maximumSourceLineLimit);
		assert.equal(excerpt.truncated, true);
	});
});
