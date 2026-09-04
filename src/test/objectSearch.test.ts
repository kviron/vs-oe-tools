import * as assert from 'node:assert/strict';
import { mapDatabaseObject, type DatabaseObjectSearchRow } from '../core/objectSearch';

suite('Database object search', () => {
	test('classifies known entity tables before generic objects', () => {
		assert.equal(mapDatabaseObject(row({ ismethod: true })).kind, 'method');
		assert.equal(mapDatabaseObject(row({ isattribute: true })).kind, 'attribute');
		assert.equal(mapDatabaseObject(row({ isclass: true })).kind, 'class');
		assert.equal(mapDatabaseObject(row({})).kind, 'object');
	});

	test('preserves owner and package context', () => {
		const result = mapDatabaseObject(row({ ownername: 'Contract', ownerid: 20, ownerclassname: 'Class', packagename: '_System' }));
		assert.equal(result.ownerId, '20');
		assert.equal(result.packageName, '_System');
	});
});

function row(overrides: Partial<DatabaseObjectSearchRow>): DatabaseObjectSearchRow {
	return { id: 25, classid: 5, seniorid: 20, name: 'Run', metaclassname: 'Method', ownername: null, ownerid: null, ownerclassname: null, packagename: null, bmpid: null, isclass: false, ismethod: false, isattribute: false, ...overrides };
}
