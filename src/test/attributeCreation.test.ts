import * as assert from 'node:assert/strict';
import {
	normalizeClassAttributeDraft,
	parseValueClassIds,
	serializeClassAttributeAuditValues,
	validateClassAttributeDraft,
} from '../features/classes/attributeCreation';
import type { ClassAttributeDraft } from '../features/classes/models';

suite('Class attribute creation', () => {
	const captured: ClassAttributeDraft = {
		ownerClassId: 3200139,
		name: 'аКонтекстПоКлассу',
		aliases: 'aKontekstPoKlassu',
		dbFieldName: 'aKontekstPoKlassu',
		attributeTypeId: 330,
		valueClasses: '10010632',
		visibilityId: 12450284,
		distributionModeId: 12450505,
		isNotNull: false,
		virtual: true,
		refIntegrityCheck: false,
	};

	test('serializes the exact field contract observed in SQL monitor', () => {
		assert.equal(serializeClassAttributeAuditValues(captured),
			'102,3200139,103,аКонтекстПоКлассу,121,aKontekstPoKlassu,71,12450284,112,aKontekstPoKlassu,113,330,115,0,1300,10010632,1313,12450505,1341,-1,12450030,0');
	});

	test('normalizes and deduplicates value class IDs', () => {
		assert.deepEqual(parseValueClassIds('10010632, 10010632, 77'), [10010632, 77]);
		assert.equal(normalizeClassAttributeDraft({ ...captured, valueClasses: '10010632, 77' }).valueClasses, '10010632,77');
	});

	test('allows a virtual attribute without a database field', () => {
		const withoutDatabaseField = { ...captured, dbFieldName: '' };
		assert.doesNotThrow(() => validateClassAttributeDraft(withoutDatabaseField));
		assert.equal(serializeClassAttributeAuditValues(withoutDatabaseField),
			'102,3200139,103,аКонтекстПоКлассу,121,aKontekstPoKlassu,71,12450284,113,330,115,0,1300,10010632,1313,12450505,1341,-1,12450030,0');
	});

	test('still rejects a malformed non-empty database field', () => {
		assert.throws(() => validateClassAttributeDraft({ ...captured, dbFieldName: 'Плохое поле' }), /SQL-идентификатор/);
	});

	test('rejects physical attributes until table DDL is captured', () => {
		assert.throws(() => validateClassAttributeDraft({ ...captured, virtual: false }), /только виртуальных/);
	});
});
