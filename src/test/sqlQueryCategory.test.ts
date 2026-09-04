import * as assert from 'node:assert/strict';
import { classifySqlQuery } from '../features/sql-monitor/queryCategory';

suite('SQL query categories', () => {
	test('recognizes East Express metadata chatter', () => {
		assert.equal(classifySqlQuery({ text: 'SELECT COUNT(id) FROM ObjectMetaDataMap WHERE SeniorID = 1', firstTable: 'ObjectMetaDataMap' }), 'metadata');
		assert.equal(classifySqlQuery({ text: 'SELECT Code FROM Methods WHERE id = 1', firstTable: 'Methods' }), 'metadata');
	});

	test('recognizes transaction and system traffic', () => {
		assert.equal(classifySqlQuery({ text: 'ROLLBACK TL=0' }), 'transaction');
		assert.equal(classifySqlQuery({ text: 'SELECT aStartID FROM OE_SYSTEM_GENGUID_ENUM_RANGES_V3(1, 2, 3)', firstTable: 'OE_SYSTEM_GENGUID_ENUM_RANGES_V3' }), 'system');
		assert.equal(classifySqlQuery({ text: 'COPY "logusercolumnsoptionsusage" FROM STDIN CSV' }), 'system');
	});

	test('keeps domain queries visible by default', () => {
		assert.equal(classifySqlQuery({ text: 'SELECT * FROM SimpleObjectAction', firstTable: 'SimpleObjectAction' }), 'application');
		assert.equal(classifySqlQuery({ text: 'SELECT * FROM СправкаПоОбъекту', firstTable: 'СправкаПоОбъекту' }), 'application');
	});
});
