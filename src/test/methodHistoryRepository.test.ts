import * as assert from 'node:assert';
import { extractCodeFromChangeValues } from '../infrastructure/database/methodHistoryParsing';
import { serializeChangeValues } from '../infrastructure/database/changeValuesSerialization';
import { extractMethodSignature, resolveMethodSignature } from '../infrastructure/database/methodSignature';

suite('Method history parser', () => {
	test('reads quoted code with doubled quotes', () => {
		assert.strictEqual(extractCodeFromChangeValues('127,"Message(""OK"")",102,42'), 'Message("OK")');
	});

	test('ignores audit entries without Methods.Code', () => {
		assert.strictEqual(extractCodeFromChangeValues('102,42'), undefined);
	});

	test('reads legacy unquoted and empty values', () => {
		assert.strictEqual(extractCodeFromChangeValues('127,begin end,102,42'), 'begin end');
		assert.strictEqual(extractCodeFromChangeValues('127,,102,42'), '');
	});

	test('serializes the native method audit contract including signature', () => {
		const value = serializeChangeValues('proc (AObj: Абстракт);\r\nbegin\r\nend;', 3200139, '(AObj: Абстракт)');
		assert.strictEqual(value, '69,"(AObj: Абстракт)",127,"proc (AObj: Абстракт);\r\nbegin\r\nend;",102,3200139');
		assert.strictEqual(extractCodeFromChangeValues(value), 'proc (AObj: Абстракт);\r\nbegin\r\nend;');
	});

	test('extracts procedure and function signatures from anonymous wrappers', () => {
		assert.strictEqual(extractMethodSignature('proc (AObj: Абстракт);\r\nbegin\r\nend;'), '(AObj: Абстракт)');
		assert.strictEqual(extractMethodSignature('function(var OutParam: Boolean;\r\n  ToRaise: Boolean = false): Boolean;\r\nvar\r\n  x: Integer;'), '(var OutParam: Boolean; ToRaise: Boolean = false): Boolean');
		assert.strictEqual(extractMethodSignature('procedure\r\nbegin\r\nend;'), '()');
	});

	test('preserves canonical signature until the declaration changes', () => {
		const oldCode = 'function(id: Roid): String;\r\nbegin\r\n  Result := "old";\r\nend;';
		const bodyOnlyChange = 'function(id: Roid): String;\r\nbegin\r\n  Result := "new";\r\nend;';
		assert.strictEqual(resolveMethodSignature(oldCode, bodyOnlyChange, '(id: Integer): string'), '(id: Integer): string');
		assert.strictEqual(resolveMethodSignature(oldCode, 'function(id: Roid; strict: Boolean): String;\r\nbegin\r\nend;', '(id: Integer): string'), '(id: Roid; strict: Boolean): String');
	});
});
