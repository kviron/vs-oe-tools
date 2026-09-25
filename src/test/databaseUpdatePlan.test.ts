import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { assertGeneratedPatchScript, parseGeneratedFileList, parseGeneratorOptions } from '../features/project/databaseUpdatePlan';

suite('Native database update plan', () => {
	test('accepts the generated OEPatch contract and rejects changed targets or keys', () => {
		const source = [
			'SET OEPATCH=..\\..\\Bin\\oepatch.exe',
			'SET OEGROUPNAMEPREFIX=',
			'SET OEDBCONNECTDATA=-l db=oetest',
			'SET OEMAINKEYS=-y -nointeractive -dontcheckdupfiles -dontregpatchfile -f -renamefinishedfilesfromlistfile %OEPATCHEXECADDITIONALKEYS%',
			'SET OEPATCHCHECKBUILD=7167',
			'%OEPATCH% %OEMAINKEYS% %OEDBCONNECTDATA% %OEGROUPNAMEPREFIX%files.lst',
		].join('\r\n');
		assert.deepEqual(assertGeneratedPatchScript(source, 'oetest'), { build: '7167' });
		assert.throws(() => assertGeneratedPatchScript(source, 'oetrunk'), /другую базу/);
		assert.throws(() => assertGeneratedPatchScript(source.replace('-nointeractive', '-interactive'), 'oetest'), /Параметры OEPatch/);
	});

	test('accepts only RDE files directly inside the generated directory', () => {
		const temp = path.join('C:', 'OE', 'trunk', 'Temp', 'test');
		const file = path.join(temp, 'transaction0.rde');
		assert.deepEqual(parseGeneratedFileList(`${file}\r\n`, temp), [file]);
		assert.throws(() => parseGeneratedFileList('..\\main\\old.rde', temp), /неожиданные пути/);
		assert.throws(() => parseGeneratedFileList('exec.bat', temp), /неожиданные пути/);
	});

	test('allows simple OEPrjScript switches without shell expressions', () => {
		assert.deepEqual(parseGeneratorOptions(' -nopackagechangelogcheck -foo=bar '), ['-nopackagechangelogcheck', '-foo=bar']);
		assert.throws(() => parseGeneratorOptions('-foo & del test'), /неподдерживаемые/);
	});
});
