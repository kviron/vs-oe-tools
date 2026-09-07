import * as assert from 'node:assert/strict';
import { buildSpuFileName, getAutomaticIdRangeStart, serializeSpuAuditChanges, serializeSpuAuditValues, validateSpuDraft } from '../features/spu/spuCreation';
import type { SpuDraft } from '../features/spu/models';

suite('SPU creation helpers', () => {
	test('builds the package filename used by East Express', () => {
		assert.equal(buildSpuFileName('  87972 - Тест  '), 'SPU_87972 - Тест');
	});

	test('derives the million-sized automatic range from PackageSTune ID', () => {
		assert.equal(getAutomaticIdRangeStart(41651432), 41000001);
		assert.throws(() => getAutomaticIdRangeStart(0), /диапазон ID/);
	});

	test('serializes quotes and SPU fields for the audit record', () => {
		const values = serializeSpuAuditValues(draft({ name: 'SPU "тест"', sqlScript: "select 'x';" }), 17);
		assert.match(values, /103,"SPU ""тест"""/);
		assert.match(values, /4029346,"07\.09\.2026 15:42:42"/);
		assert.match(values, /12609686,17/);
		assert.match(values, /12609690,"select 'x';"/);
	});

	test('requires a name, package and valid execution order', () => {
		assert.throws(() => validateSpuDraft(draft({ name: '' })), /наименование/);
		assert.throws(() => validateSpuDraft(draft({ packageId: 0 })), /пакет/);
		assert.throws(() => validateSpuDraft(draft({ executionOrder: 'bad' })), /порядок выполнения/);
		assert.doesNotThrow(() => validateSpuDraft(draft()));
	});

	test('serializes only changed fields when an SPU is edited', () => {
		const previous = draft({ isAfterUpdate: false, sqlScript: 'select 1;' });
		const next = draft({ isAfterUpdate: true, sqlScript: 'select 2;' });
		assert.deepEqual(serializeSpuAuditChanges(previous, next, 0, 0), {
			oldValues: '12609688,,12609690,"select 1;"',
			newValues: '12609688,-1,12609690,"select 2;"',
		});
	});
});

function draft(overrides: Partial<SpuDraft> = {}): SpuDraft {
	return {
		name: 'Тест', packageId: 11306023, typeId: 10200541, executionOrder: '2026-09-07T15:42:42',
		versionControl: false, beginVersion: 0, isAfterUpdate: true, executeAlways: false,
		sqlScript: 'select 1;', comment: '', ...overrides,
	};
}
