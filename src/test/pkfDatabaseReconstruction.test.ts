import * as assert from 'node:assert/strict';
import { appendPkfObjects, createEmptyPkf, extractPkfObjectIds, parseSerializedAttributeValues, serializePkfObject } from '../features/package-sync/pkfDatabaseReconstruction';
import { serializePkfMetaFile } from '../features/package-sync/pkfMetaReconstruction';

suite('PKF database reconstruction', () => {
	test('creates a new PKF header from SysFile autogroup metadata', () => {
		assert.equal(createEmptyPkf('sysPackageUpdate'), "file\r\n  autogroup 'sysPackageUpdate';\r\ndata\r\nend.\r\n");
		assert.equal(createEmptyPkf(''), 'file\r\ndata\r\nend.\r\n');
	});
	test('extracts object IDs and appends metadata-defined objects', () => {
		const source = "file\r\ndata\r\n  object ЖЦ: ЖизненныйЦикл\r\n    _Ид = '12857733';\r\n  end;\r\nend.\r\n";
		const result = appendPkfObjects(source, [
			{
				id: 3200156, className: 'ПараметрЖЦ', name: 'СвязанныеОбъекты_Просмотр', properties: [
					{ attributeId: 102, name: '_Сеньор', value: '12857733', format: 'scalar' },
					{ attributeId: 104, name: '_Порядок', value: '18', format: 'scalar' },
				],
			},
			{ id: 3200159, className: 'ПравоЖЦ', name: '$', properties: [] },
		]);
		assert.deepEqual([...extractPkfObjectIds(result)], [3200156, 3200159, 12857733]);
		assert.match(result, /object СвязанныеОбъекты_Просмотр: ПараметрЖЦ\r\n    _Ид = '3200156';/u);
		assert.match(result, /object \$: ПравоЖЦ\r\n    _Ид = '3200159';/u);
		assert.ok(result.indexOf("_Ид = '3200159'") > result.indexOf("_Ид = '3200156'"));
		assert.ok(result.endsWith('end.\r\n'));
	});

	test('appends data objects without rewriting a mixed meta section', () => {
		const source = "file\r\nmeta\r\n  Demo = class(Abstract) [_Ид='10000001']\r\n  public\r\n    var Title: string100 [_Ид='10000003'];\r\n    class var Title = 'Demo' [ЗначАтрПоУмолчанию._Ид='10000004'];\r\n  end;\r\ndata\r\nend.\r\n";
		const result = appendPkfObjects(source, [{
			id: 10000002, className: 'ИндексВТаблицеКласса', name: 'DemoIndex',
			properties: [{ attributeId: 100, name: 'КлассТаблицы', value: '10000001', format: 'scalar' }],
		}]);
		assert.ok(result.includes("  Demo = class(Abstract) [_Ид='10000001']"));
		assert.ok(result.includes('  object DemoIndex: ИндексВТаблицеКласса'));
		assert.deepEqual([...extractPkfObjectIds(result)], [10000001, 10000003, 10000004, 10000002]);
		assert.ok(result.indexOf('meta') < result.indexOf('data'));
	});

	test('inserts new blocks according to numeric object ID order', () => {
		const source = "file\ndata\n  object $: A\n    _Ид = '10';\n  end;\n  object $: A\n    _Ид = '30';\n  end;\nend.\n";
		const result = appendPkfObjects(source, [
			{ id: 20, className: 'A', name: '$', properties: [] },
		]);
		assert.deepEqual([...extractPkfObjectIds(result)], [10, 20, 30]);
	});

	test('serializes the observed database block without inventing fields', () => {
		const result = serializePkfObject({
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
		assert.deepEqual(parseSerializedAttributeValues('102,42,103,"Имя, с ""кавычкой""",500,"строка\r\n2"'), [
			{ attributeId: 102, value: '42' },
			{ attributeId: 103, value: 'Имя, с "кавычкой"' },
			{ attributeId: 500, value: 'строка\r\n2' },
		]);
	});

	test('serializes text/blob attributes as PKF blocks', () => {
		const result = serializePkfObject({
			id: 20, className: 'sysPackageUpdate', name: 'Обновление', properties: [
				{ attributeId: 12609690, name: 'SQLScript', value: 'access rdbo;\r\ncommit work;', format: 'block' },
			],
		}, '\r\n');
		assert.match(result, /SQLScript = \{\{\r\n    access rdbo;\r\n    commit work;\}\};/u);
	});

	test('quotes free-form object names, escapes Comment and sorts properties by attribute ID', () => {
		const result = serializePkfObject({
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
		assert.throws(() => appendPkfObjects(source, [
			{ id: 3200159, className: 'ПравоЖЦ', name: '$', properties: [] },
		]), /уже присутствует/u);
	});

	test('serializes a new meta PKF with attributes, defaults and methods', () => {
		const result = serializePkfMetaFile({
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
