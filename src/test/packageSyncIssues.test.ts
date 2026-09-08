import * as assert from 'node:assert/strict';
import type { PackageSyncItem } from '../features/package-sync/models';
import { findPackagePlaceholderIssues } from '../features/package-sync/packageSyncIssues';

suite('Package sync issues', () => {
	test('reports a reference placed in #package$', () => {
		const issues = findPackagePlaceholderIssues([
			item({ objectId: 38689557, objectClassId: 10, packagePath: '#package$' }),
		]);
		assert.equal(issues.length, 1);
		assert.equal(issues[0]?.message, 'ID 38689557 попал в #package$');
	});

	test('recognizes a nested placeholder path and ignores non-reference objects', () => {
		const issues = findPackagePlaceholderIssues([
			item({ objectId: 1, objectClassId: 10, objectPath: 'Refs\\#PACKAGE$\\Item' }),
			item({ objectId: 2, objectClassId: 5, packagePath: '#package$' }),
			item({ objectId: 3, objectClassId: 10, packagePath: 'УправлениеРаботами' }),
		]);
		assert.deepEqual(issues.map(issue => issue.objectId), [1]);
	});
});

function item(overrides: Partial<PackageSyncItem>): PackageSyncItem {
	return {
		objectId: 1, objectClassId: 10, objectSeniorId: null, objectName: 'Ссылка', contentMd5: '', contentRevision: null,
		changeState: '1', changedAt: '', changedBy: 'Пользователь', objectPath: '', packagePath: '', ...overrides,
	};
}
