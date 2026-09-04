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
// import * as myExtension from '../../extension';
suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    test('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
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
    test('rdboadm.ini update preserves comments and formatting', () => {
        const content = '; comment\r\n[oetrunk]\r\nDispName = Old name\r\nTCPport = 3060\r\n';
        const updated = (0, rdboadmIni_1.updateRdboadmSection)(content, 'oetrunk', [{ key: 'DispName', value: 'Новое имя' }, { key: 'TCPport', value: '4000' }]);
        assert.strictEqual(updated, '; comment\r\n[oetrunk]\r\nDispName = Новое имя\r\nTCPport = 4000\r\n');
    });
    test('project batch wrapper expands its own path without executing it', () => {
        const sourcePath = 'C:\\OE\\trunk\\DBUpdate_test.bat';
        assert.strictEqual((0, projectCommandService_1.extractBatchCommand)('@call \\\\dev\\oedistr\\dev.bat\\int\\devUpdateDB.bat "%~0" test', sourcePath), 'call \\\\dev\\oedistr\\dev.bat\\int\\devUpdateDB.bat "C:\\OE\\trunk\\DBUpdate_test.bat" test');
    });
    test('client credentials replace values from start.bat', () => {
        assert.strictEqual((0, projectCommandService_1.applyClientCredentials)('call _fme.bat -l "host=localhost,db=oetest,username=old,password=oldpass" -ok', { username: 'ВЭ_Пользователь', password: 'secret' }), 'call _fme.bat -l "host=localhost,db=oetest,username=ВЭ_Пользователь,password=secret" -ok');
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