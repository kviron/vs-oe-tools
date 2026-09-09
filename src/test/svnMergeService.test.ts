import * as assert from 'node:assert/strict';
import { parseSvnConflictInfo, parseSvnMergeOutput } from '../features/package-sync/svnMergeService';

suite('SVN merge service', () => {
	test('parses all touched files and both conflict kinds', () => {
		const files = parseSvnMergeOutput([
			"--- Merging r145401 into '.':",
			'U    Консультант\\Изменен.pkf',
			'A    Консультант\\Добавлен.pkf',
			'C    Консультант\\Текстовый.pkf',
			'   C Консультант\\Каталог',
		].join('\r\n'), 'C:\\OE\\R306\\packages');
		assert.deepEqual(files, [
			{ path: 'Консультант/Изменен.pkf', status: 'modified', conflicted: false, treeConflict: false },
			{ path: 'Консультант/Добавлен.pkf', status: 'added', conflicted: false, treeConflict: false },
			{ path: 'Консультант/Текстовый.pkf', status: 'conflicted', conflicted: true, treeConflict: false },
			{ path: 'Консультант/Каталог', status: 'conflicted', conflicted: true, treeConflict: true },
		]);
	});

	test('extracts local and incoming artifacts from svn info XML', () => {
		const parsed = parseSvnConflictInfo('<info><entry><conflict operation="merge" type="text"><prev-base-file>f.r1</prev-base-file><prev-wc-file>f.mine</prev-wc-file><cur-base-file>f.r2</cur-base-file></conflict></entry></info>');
		assert.deepEqual(parsed, { local: 'f.mine', incoming: 'f.r2' });
	});
});
