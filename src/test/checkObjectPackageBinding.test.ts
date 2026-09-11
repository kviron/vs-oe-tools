import * as assert from 'node:assert/strict';
import { evaluatePackageBinding, type ObjectPackageBinding } from '../features/package-sync/objectPackageBinding';

function binding(overrides: Partial<ObjectPackageBinding> = {}): ObjectPackageBinding {
	return {
		objectId: 3200170,
		objectClassId: 10793367,
		objectSeniorId: 10795717,
		objectName: 'Новая скидка',
		className: 'КПСкидкаКЦ',
		sysFileId: 15767360,
		fileName: 'Класс_КПСкидкаКЦ',
		sysGroupId: 11295366,
		groupName: 'Классы',
		packageId: 11306023,
		packageName: 'Консультант',
		changeState: '1',
		objectPath: '\\Классы\\Класс_КПСкидкаКЦ',
		depth: 0,
		...overrides,
	};
}

suite('check object package binding', () => {
	test('accepts an object and child in the expected concrete file', () => {
		const expected = binding({ objectId: 3191235 });
		const actual = [binding(), binding({ objectId: 3200171, objectSeniorId: 3200170, depth: 1 })];
		assert.deepEqual(evaluatePackageBinding(actual, expected), []);
	});

	test('reports the observed unbound root and #package$ child', () => {
		const expected = binding({ objectId: 3191235 });
		const actual = [
			binding({ sysFileId: null, fileName: '', changeState: '' }),
			binding({ objectId: 3200171, objectSeniorId: 3200170, sysFileId: 38689557, fileName: '#package$', changeState: '1', depth: 1 }),
		];
		const problems = evaluatePackageBinding(actual, expected);
		assert.deepEqual(problems.map(problem => problem.code), ['unbound-object', 'placeholder-file', 'unexpected-file']);
		assert.match(problems[0]?.message ?? '', /3200170/u);
		assert.match(problems[1]?.message ?? '', /#package\$/u);
	});

	test('reports a concrete file without package synchronization state', () => {
		const problems = evaluatePackageBinding([binding({ changeState: '' })]);
		assert.deepEqual(problems.map(problem => problem.code), ['missing-sync-state']);
	});
});
