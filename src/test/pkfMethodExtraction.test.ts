import * as assert from 'node:assert/strict';
import { extractPkfMethodChange, extractPkfMethodSource } from '../features/code-history/pkfMethodExtraction';

suite('PKF method extraction', () => {
	test('extracts and dedents the requested method body', () => {
		const source = [
			'file',
			'meta',
			"    procedure First '' [_Ид='10']",
			'    {{',
			'    procedure;',
			'    begin',
			'      Run;',
			'    end;',
			'    }};',
			"    procedure Second '' [_Ид='20']",
			'    {{',
			'    procedure;',
			'    begin',
			'    end;',
			'    }};',
		].join('\r\n');

		assert.equal(extractPkfMethodSource(source, 10), [
			'procedure;',
			'begin',
			'  Run;',
			'end;',
		].join('\r\n'));
	});

	test('returns undefined when the method is absent or incomplete', () => {
		assert.equal(extractPkfMethodSource("procedure Demo '' [_Ид='11']\n{{\ncode\n}};", 10), undefined);
		assert.equal(extractPkfMethodSource("procedure Demo '' [_Ид='10']\n{{\ncode", 10), undefined);
	});

	test('detects only revisions that changed the requested method', () => {
		const method = (id: number, code: string, newline = '\n') => [
			`procedure Demo '' [_Ид='${id}']`, '{{', code, '}};',
		].join(newline);
		const unchangedBefore = `${method(10, 'begin\nend;')}\n${method(20, 'old')}`;
		const unchangedAfter = `${method(10, 'begin\r\nend;', '\r\n')}\r\n${method(20, 'new', '\r\n')}`;

		assert.equal(extractPkfMethodChange(unchangedBefore, unchangedAfter, 10), undefined);
		assert.deepEqual(extractPkfMethodChange(method(10, 'old'), method(10, 'new'), 10), { before: 'old', after: 'new' });
		assert.deepEqual(extractPkfMethodChange('', method(10, 'created'), 10), { before: '', after: 'created' });
		assert.deepEqual(extractPkfMethodChange(method(10, 'removed'), '', 10), { before: 'removed', after: '' });
	});

	test('extracts code from a nested module object by its id', () => {
		const source = [
			'object $: Модуль',
			"  _Ид = '11894888';",
			'  КодМодуля = {{',
			'  procedure Build;',
			'  begin',
			'  end;',
			'  }};',
		].join('\r\n');
		assert.equal(extractPkfMethodSource(source, 11894888), 'procedure Build;\r\nbegin\r\nend;');
	});
});
