import * as assert from 'node:assert/strict';
import { parseBuildAlias } from '../features/project/binaryUpdatePlan';
import { createRdboadmIni } from '../features/project/binaryUpdate';

suite('Native binary update plan', () => {
	test('resolves only a simple build alias', () => {
		assert.equal(parseBuildAlias('@SET BuildFolder=2026_09_25(16_40)_3_7_0_7611\r\n', 'current.bat'), '2026_09_25(16_40)_3_7_0_7611');
		assert.throws(() => parseBuildAlias('@SET BuildFolder=one\r\ndel C:\\OE', 'current.bat'), /Неподдерживаемый алиас/);
	});

	test('creates distinct main and test aliases for a missing rdboadm.ini', () => {
		const variables = new Map([
			['devdbname_main', 'oetrunk'], ['devdbname_test', 'oetest'],
			['oedbmspath', 'C:\\PostgreSQL\\18'], ['oedbmspassword', 'secret'],
		]);
		const ini = createRdboadmIni(variables);
		assert.match(ini, /\[oetrunk\]\r\nDispName = Основная база\. Релиз trunk/);
		assert.match(ini, /\[oetest\]\r\nDispName = Тестовая база\. Релиз trunk/);
		assert.match(ini, /dbpath = localhost:5432\/oetest/);
	});
});
