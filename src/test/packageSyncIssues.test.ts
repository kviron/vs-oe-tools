import * as assert from 'node:assert/strict';
import type { PackageSyncItem } from '../features/package-sync/models';
import { createPackagePlaceholderIssues, isPackagePlaceholderItem, parsePackagePlaceholderObjects } from '../features/package-sync/packageSyncIssues';

suite('Package sync issues', () => {
	test('reports the concrete object found inside #package$.pkf', () => {
		const source = `file\r\ndata\r\n  object $"Выполнение действия по ЖЦ": ТипДействияНадОбьектом\r\n    _Ид = '3200004';\r\n    _Сеньор = '20005';\r\n  end;\r\nend.`;
		const objects = parsePackagePlaceholderObjects(source);
		const issues = createPackagePlaceholderIssues(
			item({ objectId: 38689557, objectClassId: 68725, objectName: '#package$', objectPath: '\\#package$', packagePath: 'Консультант' }),
			'C:\\OE\\trunk\\packages\\Консультант\\#package$.pkf',
			objects,
		);
		assert.equal(issues.length, 1);
		assert.deepEqual(objects, [{ objectId: 3200004, objectName: 'Выполнение действия по ЖЦ', objectType: 'ТипДействияНадОбьектом' }]);
		assert.equal(issues[0]?.message, 'Объект «Выполнение действия по ЖЦ» (ID 3200004) попал в #package$.pkf — извлеките его из этого файла');
	});

	test('recognizes the physical placeholder filename regardless of its object class', () => {
		assert.equal(isPackagePlaceholderItem(item({ objectClassId: 68725, localPath: 'C:\\OE\\trunk\\packages\\Консультант\\#PACKAGE$.pkf' })), true);
		assert.equal(isPackagePlaceholderItem(item({ objectClassId: 68725, objectPath: '\\#package$' })), true);
		assert.equal(isPackagePlaceholderItem(item({ objectClassId: 10, localPath: 'C:\\OE\\trunk\\packages\\Консультант\\Ссылки.pkf' })), false);
	});
});

function item(overrides: Partial<PackageSyncItem>): PackageSyncItem {
	return {
		objectId: 1, objectClassId: 10, objectSeniorId: null, objectName: 'Ссылка', contentMd5: '', contentRevision: null,
		changeState: '1', changedAt: '', changedBy: 'Пользователь', objectPath: '', packagePath: '', ...overrides,
	};
}
