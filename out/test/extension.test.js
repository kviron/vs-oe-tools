"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = __importStar(require("vscode"));
const sqlResultExport_1 = require("../features/sql-executor/sqlResultExport");
const sqlDialectAdapter_1 = require("../features/sql-executor/sqlDialectAdapter");
const projectDatabaseOptions_1 = require("../infrastructure/configuration/projectDatabaseOptions");
const rdboadmIni_1 = require("../infrastructure/configuration/rdboadmIni");
const projectCommandService_1 = require("../features/project/projectCommandService");
const projectStatusBar_1 = require("../features/project/projectStatusBar");
const databaseSelection_1 = require("../core/databaseSelection");
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
        const variables = (0, projectDatabaseOptions_1.parseVarsFile)([
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
        const databases = (0, rdboadmIni_1.parseRdboadmIni)('[oetrunk]\r\nDispName = Основная база\r\ndbpath = localhost:5433/oetrunk\r\ndbusername = postgres\r\ndbpassword = root\r\n');
        assert.strictEqual(databases[0].name, 'Основная база');
        assert.deepStrictEqual((0, rdboadmIni_1.rdboadmDatabaseOptions)(databases[0]), { host: 'localhost', port: 5433, database: 'oetrunk', user: 'postgres', password: 'root' });
    });
    test('rdboadm.ini is resolved from the opened project root regardless of its folder name', () => {
        assert.strictEqual((0, rdboadmIni_1.resolveRdboadmPath)('C:\\OE\\release-3.7'), 'C:\\OE\\release-3.7\\bin\\rdboadm.ini');
    });
    test('active MCP workspace selection uses one stable cross-workspace path', () => {
        const selectionPath = (0, databaseSelection_1.getActiveDatabaseSelectionPath)();
        assert.ok(selectionPath.endsWith('vc-ve-tools\\active-database-selection.json'));
        assert.ok(!selectionPath.toLowerCase().includes('oetrunk'));
    });
    test('rdboadm.ini update preserves comments and formatting', () => {
        const content = '; comment\r\n[oetrunk]\r\nDispName = Old name\r\nTCPport = 3060\r\n';
        const updated = (0, rdboadmIni_1.updateRdboadmSection)(content, 'oetrunk', [{ key: 'DispName', value: 'Новое имя' }, { key: 'TCPport', value: '4000' }]);
        assert.strictEqual(updated, '; comment\r\n[oetrunk]\r\nDispName = Новое имя\r\nTCPport = 4000\r\n');
    });
    test('project batch wrapper expands its own path without executing it', () => {
        const sourcePath = 'C:\\OE\\trunk\\DBUpdate_test.bat';
        assert.strictEqual((0, projectCommandService_1.extractBatchCommand)('@call \\\\dev\\oedistr\\dev.bat\\int\\devUpdateDB.bat "%~0" test', sourcePath), 'call \\\\dev\\oedistr\\dev.bat\\int\\devUpdateDB.bat "C:\\OE\\trunk\\DBUpdate_test.bat" test');
    });
    test('project binary update invokes the wrapper batch file itself', () => {
        assert.strictEqual((0, projectCommandService_1.createBatchFileCommand)('C:\\OE\\trunk\\BinUpdate.bat'), 'call "C:\\OE\\trunk\\BinUpdate.bat"');
        assert.throws(() => (0, projectCommandService_1.createBatchFileCommand)('C:\\OE\\bad"path\\BinUpdate.bat'), /недопустимые символы/);
    });
    test('client launch command invokes fme.exe without project batch files', () => {
        const command = (0, projectCommandService_1.createClientLaunchCommand)('C:\\OE\\trunk', 'main', { host: 'localhost', database: 'oetrunk' }, { username: 'ВЭ_Пользователь', password: 'secret' }, 'oe-oetrunk:/open/Метод/11158589');
        assert.strictEqual(command, 'start "" /D "C:\\OE\\trunk\\bin" "C:\\OE\\trunk\\bin\\fme.exe" -NoSelfUpdate "oe-oetrunk:/open/Метод/11158589" -l "host=localhost,db=oetrunk,username=ВЭ_Пользователь,password=secret,MultiLogin=True" -ok');
        assert.ok(!/\.bat|\bcall\b/iu.test(command));
        assert.throws(() => (0, projectCommandService_1.createClientLaunchCommand)('C:\\OE\\trunk', 'test', { host: 'localhost', database: 'oetest' }, {}), /Укажите логин и пароль/);
    });
    test('client launch command safely appends configured arguments', () => {
        assert.deepStrictEqual((0, projectCommandService_1.parseClientLaunchArguments)('-BeautifyPGQueries -CustomOption "value with spaces"'), ['-BeautifyPGQueries', '-CustomOption', 'value with spaces']);
        const command = (0, projectCommandService_1.createClientLaunchCommand)('C:\\OE\\trunk', 'test', { host: 'localhost', database: 'oetest' }, { username: 'user', password: 'secret' }, undefined, '-BeautifyPGQueries -CustomOption "value with spaces"');
        assert.ok(command.includes('-NoSelfUpdate "-BeautifyPGQueries" "-CustomOption" "value with spaces" -l'));
        assert.throws(() => (0, projectCommandService_1.parseClientLaunchArguments)('-l hacked'), /задаётся расширением автоматически/);
        assert.throws(() => (0, projectCommandService_1.parseClientLaunchArguments)('-CustomOption & whoami'), /недопустимые/);
        assert.throws(() => (0, projectCommandService_1.parseClientLaunchArguments)('-CustomOption "unfinished'), /не закрыта/);
    });
    test('project status bar offers main and test database actions', () => {
        assert.deepStrictEqual(projectStatusBar_1.projectRoleActions.map(action => ({ label: action.label, role: action.role })), [
            { label: 'Основная база', role: 'main' },
            { label: 'Тестовая база', role: 'test' },
        ]);
        assert.strictEqual((0, projectStatusBar_1.activeDatabaseStatusText)('oetrunk', 'test'), '$(database) oetrunk $(chevron-down)');
        assert.strictEqual((0, projectStatusBar_1.activeDatabaseStatusText)('', 'main'), '$(database) Основная $(chevron-down)');
        assert.strictEqual((0, projectStatusBar_1.activeDatabaseStatusText)('', 'test'), '$(database) Тестовая $(chevron-down)');
    });
    test('SQL result export produces readable Markdown and valid JSON', () => {
        const result = {
            rowCount: 2,
            columns: ['ID', 'Name'],
            rows: [{ ID: 1, Name: 'Первая | строка' }, { ID: 2, Name: null }],
            resultTruncated: false,
        };
        const markdown = (0, sqlResultExport_1.formatSqlResult)(result, 'markdown');
        assert.ok(markdown.includes('| 1 | Первая \\| строка |'));
        assert.ok(markdown.includes('| 2 | NULL |'));
        assert.deepStrictEqual(JSON.parse((0, sqlResultExport_1.formatSqlResult)(result, 'json')).rows, result.rows);
    });
    test('SQL result CSV uses semicolons and escapes quotes', () => {
        const csv = (0, sqlResultExport_1.formatSqlResult)({
            rowCount: 1,
            columns: ['ID', 'Text'],
            rows: [{ ID: 7, Text: 'значение "в кавычках"' }],
            resultTruncated: false,
        }, 'csv');
        assert.strictEqual(csv, '"ID";"Text"\r\n"7";"значение ""в кавычках"""\r\n');
    });
    test('VE SQL adapter expands a composite date-time attribute', () => {
        const columns = new Map([
            ['t0', new Set(['id', 'beginplan_date', 'beginplan_tz', 'timezone'])],
        ]);
        const source = "SELECT T0.BeginPlan, T0.BeginPlan_date, 'T0.BeginPlan' FROM EducServDocument T0";
        const adapted = (0, sqlDialectAdapter_1.adaptCompositeDateTimeFields)(source, columns);
        assert.strictEqual(adapted, "SELECT COALESCE(timezone(T0.timezone, T0.BeginPlan_tz), T0.BeginPlan_date), T0.BeginPlan_date, 'T0.BeginPlan' FROM EducServDocument T0");
    });
});
//# sourceMappingURL=extension.test.js.map