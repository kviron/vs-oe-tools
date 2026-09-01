import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { parseVarsFile } from '../infrastructure/configuration/projectDatabaseOptions';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Vars.bat parser supports quoted and role-specific variables', () => {
		const variables = parseVarsFile([
			'@set "devDBName_main=production"',
			'set devDBName_test = test_database',
			'set oeDBMSPort=5433',
			'rem ignored line',
		].join('\r\n'));

		assert.strictEqual(variables.get('devdbname_main'), 'production');
		assert.strictEqual(variables.get('devdbname_test'), 'test_database');
		assert.strictEqual(variables.get('oedbmsport'), '5433');
	});
});
