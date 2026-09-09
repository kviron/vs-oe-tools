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
const assert = __importStar(require("node:assert/strict"));
const pkfDatabaseReconstruction_1 = require("../features/package-sync/pkfDatabaseReconstruction");
const pkfMetaReconstruction_1 = require("../features/package-sync/pkfMetaReconstruction");
suite('PKF database reconstruction', () => {
    test('creates a new PKF header from SysFile autogroup metadata', () => {
        assert.equal((0, pkfDatabaseReconstruction_1.createEmptyPkf)('sysPackageUpdate'), "file\r\n  autogroup 'sysPackageUpdate';\r\ndata\r\nend.\r\n");
        assert.equal((0, pkfDatabaseReconstruction_1.createEmptyPkf)(''), 'file\r\ndata\r\nend.\r\n');
    });
    test('extracts object IDs and appends metadata-defined objects', () => {
        const source = "file\r\ndata\r\n  object ЖЦ: ЖизненныйЦикл\r\n    _Ид = '12857733';\r\n  end;\r\nend.\r\n";
        const result = (0, pkfDatabaseReconstruction_1.appendPkfObjects)(source, [
            {
                id: 3200156, className: 'ПараметрЖЦ', name: 'СвязанныеОбъекты_Просмотр', properties: [
                    { attributeId: 102, name: '_Сеньор', value: '12857733', format: 'scalar' },
                    { attributeId: 104, name: '_Порядок', value: '18', format: 'scalar' },
                ],
            },
            { id: 3200159, className: 'ПравоЖЦ', name: '$', properties: [] },
        ]);
        assert.deepEqual([...(0, pkfDatabaseReconstruction_1.extractPkfObjectIds)(result)], [3200156, 3200159, 12857733]);
        assert.match(result, /object СвязанныеОбъекты_Просмотр: ПараметрЖЦ\r\n    _Ид = '3200156';/u);
        assert.match(result, /object \$: ПравоЖЦ\r\n    _Ид = '3200159';/u);
        assert.ok(result.indexOf("_Ид = '3200159'") > result.indexOf("_Ид = '3200156'"));
        assert.ok(result.endsWith('end.\r\n'));
    });
    test('inserts new blocks according to numeric object ID order', () => {
        const source = "file\ndata\n  object $: A\n    _Ид = '10';\n  end;\n  object $: A\n    _Ид = '30';\n  end;\nend.\n";
        const result = (0, pkfDatabaseReconstruction_1.appendPkfObjects)(source, [
            { id: 20, className: 'A', name: '$', properties: [] },
        ]);
        assert.deepEqual([...(0, pkfDatabaseReconstruction_1.extractPkfObjectIds)(result)], [10, 20, 30]);
    });
    test('serializes the observed database block without inventing fields', () => {
        const result = (0, pkfDatabaseReconstruction_1.serializePkfObject)({
            id: 3200158, className: 'ПараметрЖЦ', name: 'СвязанныеОбъекты_Правка', properties: [
                { attributeId: 102, name: '_Сеньор', value: '12857733', format: 'scalar' },
                { attributeId: 104, name: '_Порядок', value: '19', format: 'scalar' },
                { attributeId: 8921649, name: 'Наименование', value: 'Связанные объекты (правка)', format: 'scalar' },
                { attributeId: 8922729, name: 'АтрибутСсылка', value: '0', format: 'scalar' },
                { attributeId: 8927439, name: 'ВидПарам', value: '8927426', format: 'scalar' },
            ],
        });
        assert.equal(result, [
            '  object СвязанныеОбъекты_Правка: ПараметрЖЦ',
            "    _Ид = '3200158';",
            "    _Сеньор = '12857733';",
            "    _Порядок = '19';",
            "    Наименование = 'Связанные объекты (правка)';",
            "    АтрибутСсылка = '0';",
            "    ВидПарам = '8927426';",
            '  end;',
        ].join('\n'));
    });
    test('parses arbitrary audit attributes including quoted commas and quotes', () => {
        assert.deepEqual((0, pkfDatabaseReconstruction_1.parseSerializedAttributeValues)('102,42,103,"Имя, с ""кавычкой""",500,"строка\r\n2"'), [
            { attributeId: 102, value: '42' },
            { attributeId: 103, value: 'Имя, с "кавычкой"' },
            { attributeId: 500, value: 'строка\r\n2' },
        ]);
    });
    test('serializes text/blob attributes as PKF blocks', () => {
        const result = (0, pkfDatabaseReconstruction_1.serializePkfObject)({
            id: 20, className: 'sysPackageUpdate', name: 'Обновление', properties: [
                { attributeId: 12609690, name: 'SQLScript', value: 'access rdbo;\r\ncommit work;', format: 'block' },
            ],
        }, '\r\n');
        assert.match(result, /SQLScript = \{\{\r\n    access rdbo;\r\n    commit work;\}\};/u);
    });
    test('quotes free-form object names, escapes Comment and sorts properties by attribute ID', () => {
        const result = (0, pkfDatabaseReconstruction_1.serializePkfObject)({
            id: 20, className: 'sysPackageUpdate', name: 'Обновление с пробелом', properties: [
                { attributeId: 12609690, name: 'SQLScript', value: 'commit work;', format: 'block' },
                { attributeId: 12609689, name: 'Comment', value: 'Описание', format: 'scalar' },
            ],
        });
        assert.match(result, /^  object \$"Обновление с пробелом": sysPackageUpdate/mu);
        assert.ok(result.indexOf("$Comment = 'Описание'") < result.indexOf('SQLScript = {{'));
    });
    test('refuses a duplicate object ID', () => {
        const source = "file\ndata\n  object $: ПравоЖЦ\n    _Ид = '3200159';\n  end;\nend.";
        assert.throws(() => (0, pkfDatabaseReconstruction_1.appendPkfObjects)(source, [
            { id: 3200159, className: 'ПравоЖЦ', name: '$', properties: [] },
        ]), /уже присутствует/u);
    });
    test('serializes a new meta PKF with attributes, defaults and methods', () => {
        const result = (0, pkfMetaReconstruction_1.serializePkfMetaFile)({
            id: 3200139, name: 'ДАнкетаДокумент_СвязанныеОбъекты', aliases: '', parentName: 'ДАнкетаДокумент',
            isVirtual: true, cacheObjectClass: null, referenceIntegrityCheck: 1,
        }, [
            { kind: 'attribute', id: 3200140, name: 'Объект', aliases: '', visibility: 'private', valueClassName: 'BaseClass', databaseFieldName: '', readRole: 0, writeRole: 0, referenceIntegrityCheck: 1 },
            { kind: 'default', id: 3200141, name: 'Объект', visibility: 'public', value: '0', block: false },
            { kind: 'method', id: 3200142, name: 'Открыть', aliases: '', visibility: 'public', methodKind: 0, signature: '', code: 'procedure Открыть;\r\nbegin\r\nend' },
        ]);
        assert.match(result, /ДАнкетаДокумент_СвязанныеОбъекты = virtual class\(ДАнкетаДокумент\) \[_Ид='3200139',ПровСсылЦел='1'\]/u);
        assert.match(result, /private\r\n    var Объект: embedded BaseClass notstored \[_Ид='3200140',РольДляЧтения='0',РольДляЗаписи='0',ПровСсылЦел='1'\];/u);
        assert.match(result, /class var Объект = '0' \[ЗначАтрПоУмолчанию\._Ид='3200141'\];/u);
        assert.match(result, /procedure Открыть '' \[_Ид='3200142'\]\r\n    \{\{\r\n    procedure Открыть;/u);
    });
});
//# sourceMappingURL=pkfDatabaseReconstruction.test.js.map