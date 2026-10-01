import { matchesSearch, type SearchMode } from '../core/searchMatch';
import * as assert from 'node:assert';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as iconv from 'iconv-lite';
import { listNativeLogs, readNativeLog } from '../features/native-logs/nativeLogService';

suite('Native client logs', () => {
	let workspacePath: string;

	setup(async () => {
		workspacePath = await mkdtemp(path.join(os.tmpdir(), 'vc-ve-native-logs-'));
		await mkdir(path.join(workspacePath, 'bin', 'logs'), { recursive: true });
		await mkdir(path.join(workspacePath, 'bin.win64', 'logs'), { recursive: true });
	});

	teardown(async () => {
		await rm(workspacePath, { recursive: true, force: true });
	});

	test('prefers bin logs and decodes Windows-1251 content', async () => {
		await writeFile(path.join(workspacePath, 'bin', 'logs', 'client.stack'), iconv.encode('Ошибка клиента\r\nСтрока 2', 'win1251'));
		await writeFile(path.join(workspacePath, 'bin.win64', 'logs', 'server.stack'), iconv.encode('Ошибка сервера', 'win1251'));

		const listing = await listNativeLogs(workspacePath);
		assert.equal(listing.directory, path.join(workspacePath, 'bin', 'logs'));
		assert.deepEqual(listing.files.map(file => file.name), ['client.stack']);
		const content = await readNativeLog(workspacePath, 'client.stack', 1, 1);
		assert.equal(content.content, 'Ошибка клиента');
		assert.equal(content.totalLines, 2);
		assert.equal(content.truncated, true);
	});

	test('searches content beyond the listing limit with native encoding and options', async () => {
		const directory = path.join(workspacePath, 'bin', 'logs');
		await Promise.all(Array.from({ length: 501 }, (_, index) => writeFile(path.join(directory, String(index).padStart(3, '0') + '.log'), 'unrelated')));
		const target = path.join(directory, 'zzz.log');
		await writeFile(target, iconv.encode('Первая строка\r\nОшибка клиента', 'win1251'));
		await utimes(target, new Date('2030-01-01'), new Date('2030-01-01'));
		assert.equal((await listNativeLogs(workspacePath, 1)).files[0].name, 'zzz.log');
		assert.deepEqual((await listNativeLogs(workspacePath, 1, 'ошибка')).files.map(file => file.name), ['zzz.log']);
		assert.equal((await listNativeLogs(workspacePath, 1, 'ошибка', { mode: 'contains', caseSensitive: true })).files.length, 0);
		assert.equal((await listNativeLogs(workspacePath, 1, 'Ошибка клиента', { mode: 'exact', caseSensitive: true })).files[0].name, 'zzz.log');
		assert.equal((await listNativeLogs(workspacePath, 1, 'zzz')).files[0].name, 'zzz.log');
	});

	test('streams large logs and keeps whole-word and line search boundaries', async () => {
  const directory = path.join(workspacePath, 'bin', 'logs');
  await writeFile(path.join(directory, 'large.log'), iconv.encode(('обычная строка\n').repeat(400000) + 'Ошибка клиента\n', 'win1251'));
  assert.equal((await listNativeLogs(workspacePath, 10, 'Ошибка клиента', { mode: 'exact', caseSensitive: true })).files.length, 1);
  await writeFile(path.join(directory, 'boundary.log'), 'x'.repeat(65531) + ' ' + 'fail' + 'ure\n');
  assert.deepEqual((await listNativeLogs(workspacePath, 10, 'fail', { mode: 'word', caseSensitive: true })).files, []);
  assert.equal((await listNativeLogs(workspacePath, 10, 'failure', { mode: 'word', caseSensitive: true })).files.length, 1);
  assert.equal((await listNativeLogs(workspacePath, 10, 'failA', { mode: 'word', caseSensitive: true })).files.length, 0);
 });
 test('keeps streamed search equivalent to full text and line matching', async () => {
  const content = 'prefix first\r\n' + 'x'.repeat(70000) + ' boundary suffix\r\nlast exact';
  await writeFile(path.join(workspacePath, 'bin', 'logs', 'sample.log'), content);
  for (const mode of ['contains', 'starts', 'ends', 'exact', 'word'] as SearchMode[]) {
   for (const query of ['prefix', 'first', 'boundary', 'suffix', 'last exact', 'notfound', 'A' + 'x'.repeat(8), 'first\r\nx']) {
    const options = { mode, caseSensitive: true };
    const expected = matchesSearch(content, query, options) || content.split(/\r?\n/u).some(line => matchesSearch(line, query, options));
    assert.equal((await listNativeLogs(workspacePath, 10, query, options)).files.length > 0, expected, mode + ': ' + query);
   }
  }
 });
 test('rejects paths outside the selected log directory', async () => {
		await writeFile(path.join(workspacePath, 'bin', 'logs', 'client.log'), 'log');
		await assert.rejects(() => readNativeLog(workspacePath, '..\\Vars.bat'), /без пути/);
	});

	test('detects UTF-16LE log files without a byte order mark', async () => {
		await writeFile(path.join(workspacePath, 'bin', 'logs', 'client.log'), Buffer.from('Ошибка UTF-16\r\nВторая строка', 'utf16le'));
		const content = await readNativeLog(workspacePath, 'client.log');
		assert.equal(content.content, 'Ошибка UTF-16\nВторая строка');
	});
});
