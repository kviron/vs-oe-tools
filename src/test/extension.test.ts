import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { formatSqlResult } from '../features/sql-executor/sqlResultExport';
import { adaptCompositeDateTimeFields } from '../features/sql-executor/sqlDialectAdapter';
import { parseVarsFile } from '../infrastructure/configuration/projectDatabaseOptions';
import { parseRdboadmIni, rdboadmDatabaseOptions, resolveRdboadmPath, updateRdboadmSection } from '../infrastructure/configuration/rdboadmIni';
import { createBatchFileCommand, createClientLaunchCommand, extractBatchCommand, parseClientLaunchArguments } from '../features/project/projectCommandService';
import { activeDatabaseStatusText, projectRoleActions } from '../features/project/projectStatusBar';
import { getActiveDatabaseSelectionPath } from '../core/databaseSelection';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('development extension activates', async () => {
		const extension = vscode.extensions.getExtension('Kviron.vc-ve-tools');
		assert.ok(extension, 'Расширение Kviron.vc-ve-tools не найдено');
		await extension.activate();
		assert.equal(extension.isActive, true);
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

	test('rdboadm.ini is resolved from the opened project root regardless of its folder name', () => {
		assert.strictEqual(resolveRdboadmPath('C:\\OE\\release-3.7'), 'C:\\OE\\release-3.7\\bin\\rdboadm.ini');
	});

	test('active MCP workspace selection uses one stable cross-workspace path', () => {
		const selectionPath = getActiveDatabaseSelectionPath();
		assert.ok(selectionPath.endsWith('vc-ve-tools\\active-database-selection.json'));
		assert.ok(!selectionPath.toLowerCase().includes('oetrunk'));
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

	test('project binary update invokes the wrapper batch file itself', () => {
		assert.strictEqual(createBatchFileCommand('C:\\OE\\trunk\\BinUpdate.bat'), 'call "C:\\OE\\trunk\\BinUpdate.bat"');
		assert.throws(() => createBatchFileCommand('C:\\OE\\bad"path\\BinUpdate.bat'), /недопустимые символы/);
	});

	test('client launch command invokes fme.exe without project batch files', () => {
		const command = createClientLaunchCommand(
			'C:\\OE\\trunk',
			'main',
			{ host: 'localhost', database: 'oetrunk' },
			{ username: 'ВЭ_Пользователь', password: 'secret' },
			'oe-oetrunk:/open/Метод/11158589',
		);
		assert.strictEqual(
			command,
			'start "" /D "C:\\OE\\trunk\\bin" "C:\\OE\\trunk\\bin\\fme.exe" -NoSelfUpdate "oe-oetrunk:/open/Метод/11158589" -l "host=localhost,db=oetrunk,username=ВЭ_Пользователь,password=secret,MultiLogin=True" -ok',
		);
		assert.ok(!/\.bat|\bcall\b/iu.test(command));
		assert.throws(
			() => createClientLaunchCommand('C:\\OE\\trunk', 'test', { host: 'localhost', database: 'oetest' }, {}),
			/Укажите логин и пароль/,
		);
	});

	test('client launch command safely appends configured arguments', () => {
		assert.deepStrictEqual(
			parseClientLaunchArguments('-BeautifyPGQueries -CustomOption "value with spaces"'),
			['-BeautifyPGQueries', '-CustomOption', 'value with spaces'],
		);
		const command = createClientLaunchCommand(
			'C:\\OE\\trunk',
			'test',
			{ host: 'localhost', database: 'oetest' },
			{ username: 'user', password: 'secret' },
			undefined,
			'-BeautifyPGQueries -CustomOption "value with spaces"',
		);
		assert.ok(command.includes('-NoSelfUpdate "-BeautifyPGQueries" "-CustomOption" "value with spaces" -l'));
		assert.throws(() => parseClientLaunchArguments('-l hacked'), /задаётся расширением автоматически/);
		assert.throws(() => parseClientLaunchArguments('-CustomOption & whoami'), /недопустимые/);
		assert.throws(() => parseClientLaunchArguments('-CustomOption "unfinished'), /не закрыта/);
	});

	test('project status bar offers main and test database actions', () => {
		assert.deepStrictEqual(
			projectRoleActions.map(action => ({ label: action.label, role: action.role })),
			[
				{ label: 'Основная база', role: 'main' },
				{ label: 'Тестовая база', role: 'test' },
			],
		);
		assert.strictEqual(activeDatabaseStatusText('oetrunk', 'test'), '$(database) oetrunk $(chevron-down)');
		assert.strictEqual(activeDatabaseStatusText('', 'main'), '$(database) Основная $(chevron-down)');
		assert.strictEqual(activeDatabaseStatusText('', 'test'), '$(database) Тестовая $(chevron-down)');
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
