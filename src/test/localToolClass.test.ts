import * as assert from 'node:assert/strict';
import { validateLocalToolClassName } from '../features/classes/localToolClassName';

suite('Local tool class creation input', () => {
	test('accepts a Windows-1251 class identifier', () => {
		assert.equal(validateLocalToolClassName('  Инструменты_MCP2  '), 'Инструменты_MCP2');
	});

	test('rejects names that cannot be represented by native metadata', () => {
		assert.throws(() => validateLocalToolClassName('Class Name'), /идентификатором/);
		assert.throws(() => validateLocalToolClassName('ClassŁ'), /Windows-1251/);
	});
});
