import * as assert from 'node:assert/strict';
import { parseProductionTaskRichDescription } from '../features/production-tasks/productionTaskRichText';

suite('Production task rich text', () => {
	test('extracts text and an embedded PNG at its RTF position', () => {
		const png = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415408d763f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082';
		const rtf = `{\\rtf1\\ansi\\ansicpg1251 До{\\pict\\pngblip\\picwgoal1500\\pichgoal750 ${png}}После\\par строка}`;
		assert.deepEqual(parseProductionTaskRichDescription(rtf), [
			{ kind: 'text', text: 'До' },
			{ kind: 'image', dataUrl: `data:image/png;base64,${Buffer.from(png, 'hex').toString('base64')}`, width: 100, height: 50 },
			{ kind: 'text', text: 'После\nстрока' },
		]);
	});

	test('decodes Windows-1251 escapes and Unicode fallback characters', () => {
		const jpeg = 'ffd8ffe000104a46494600010100000100010000ffd9';
		const rtf = `{\\rtf1\\ansi\\ansicpg1251 \\'cf\\'f0\\'e8\\u1074?\\u1077?\\u1090?{\\pict\\jpegblip ${jpeg}}}`;
		const parts = parseProductionTaskRichDescription(rtf);
		assert.equal(parts[0]?.kind === 'text' ? parts[0].text : '', 'Привет');
		assert.equal(parts[1]?.kind, 'image');
	});

	test('keeps the plain description path when RTF has no supported image', () => {
		assert.deepEqual(parseProductionTaskRichDescription('{\\rtf1 Только текст}'), []);
		assert.deepEqual(parseProductionTaskRichDescription('Только текст'), []);
	});

	test('extracts a Windows Metafile for host-side conversion', () => {
		const wmf = `01000900${'00'.repeat(14)}`;
		const parts = parseProductionTaskRichDescription(`{\\rtf1 до{\\pict\\wmetafile8 ${wmf}}после}`);
		assert.deepEqual(parts, [
			{ kind: 'text', text: 'до' },
			{ kind: 'image', dataUrl: `data:image/x-wmf;base64,${Buffer.from(wmf, 'hex').toString('base64')}`, width: undefined, height: undefined },
			{ kind: 'text', text: 'после' },
		]);
	});
});
