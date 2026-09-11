import * as assert from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
