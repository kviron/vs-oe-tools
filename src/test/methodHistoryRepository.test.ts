import * as assert from 'node:assert';
import { extractCodeFromChangeValues } from '../infrastructure/database/methodHistoryParsing';

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
});
