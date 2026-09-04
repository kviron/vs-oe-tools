import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { formatSqlResult } from '../features/sql-executor/sqlResultExport';
import { adaptCompositeDateTimeFields } from '../features/sql-executor/sqlDialectAdapter';
import { parseVarsFile } from '../infrastructure/configuration/projectDatabaseOptions';
import { parseRdboadmIni, rdboadmDatabaseOptions, updateRdboadmSection } from '../infrastructure/configuration/rdboadmIni';
import { applyClientCredentials, applyClientOpenUri, extractBatchCommand } from '../features/project/projectCommandService';
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

	test('rdboadm.ini parser reads display names and connection options', () => {
		const databases = parseRdboadmIni('[oetrunk]\r\nDispName = Основная база\r\ndbpath = localhost:5433/oetrunk\r\ndbusername = postgres\r\ndbpassword = root\r\n');
		assert.strictEqual(databases[0].name, 'Основная база');
		assert.deepStrictEqual(rdboadmDatabaseOptions(databases[0]), { host: 'localhost', port: 5433, database: 'oetrunk', user: 'postgres', password: 'root' });
	});

	test('rdboadm.ini update preserves comments and formatting', () => {
		const content = '; comment\r\n[oetrunk]\r\nDispName = Old name\r\nTCPport = 3060\r\n';
		const updated = updateRdboadmSection(content, 'oetrunk', [{ key: 'DispName', value: 'Новое имя' }, { key: 'TCPport', value: '4000' }]);
		assert.strictEqual(updated, '; comment\r\n[oetrunk]\r\nDispName = Новое имя\r\nTCPport = 4000\r\n');
	});

	test('project batch wrapper expands its own path without executing it', () => {
		const sourcePath = 'C:\\OE\\trunk\\DBUpdate_test.bat';
		assert.strictEqual(
			extractBatchCommand('@call \\\\dev\\oedistr\\dev.bat\\int\\devUpdateDB.bat "%~0" test', sourcePath),
			'call \\\\dev\\oedistr\\dev.bat\\int\\devUpdateDB.bat "C:\\OE\\trunk\\DBUpdate_test.bat" test',
		);
	});

	test('client credentials replace values from start.bat', () => {
		assert.strictEqual(
			applyClientCredentials('call _fme.bat -l "host=localhost,db=oetest,username=old,password=oldpass" -ok', { username: 'ВЭ_Пользователь', password: 'secret' }),
			'call _fme.bat -l "host=localhost,db=oetest,username=ВЭ_Пользователь,password=secret" -ok',
		);
	});

	test('client deep link is passed before login arguments', () => {
		assert.strictEqual(
			applyClientOpenUri('call "C:\\OE\\trunk\\_fme.bat" -l "host=localhost,db=oetrunk" -ok', 'oe-oetrunk:/open/Метод/11158589'),
			'call "C:\\OE\\trunk\\_fme.bat" "oe-oetrunk:/open/Метод/11158589" -l "host=localhost,db=oetrunk" -ok',
		);
	});

	test('SQL result export produces readable Markdown and valid JSON', () => {
		const result = {
			rowCount: 2,
			columns: ['ID', 'Name'],
			rows: [{ ID: 1, Name: 'Первая | строка' }, { ID: 2, Name: null }],
			resultTruncated: false,
		};

		const markdown = formatSqlResult(result, 'markdown');
		assert.ok(markdown.includes('| 1 | Первая \\| строка |'));
		assert.ok(markdown.includes('| 2 | NULL |'));
		assert.deepStrictEqual(JSON.parse(formatSqlResult(result, 'json')).rows, result.rows);
	});

	test('SQL result CSV uses semicolons and escapes quotes', () => {
		const csv = formatSqlResult({
			rowCount: 1,
			columns: ['ID', 'Text'],
			rows: [{ ID: 7, Text: 'значение "в кавычках"' }],
			resultTruncated: false,
		}, 'csv');

		assert.strictEqual(csv, '"ID";"Text"\r\n"7";"значение ""в кавычках"""\r\n');
	});

	test('VE SQL adapter expands a composite date-time attribute', () => {
		const columns = new Map<string, Set<string>>([
			['t0', new Set(['id', 'beginplan_date', 'beginplan_tz', 'timezone'])],
		]);
		const source = "SELECT T0.BeginPlan, T0.BeginPlan_date, 'T0.BeginPlan' FROM EducServDocument T0";
		const adapted = adaptCompositeDateTimeFields(source, columns);

		assert.strictEqual(adapted,
			"SELECT COALESCE(timezone(T0.timezone, T0.BeginPlan_tz), T0.BeginPlan_date), T0.BeginPlan_date, 'T0.BeginPlan' FROM EducServDocument T0");
	});
});
