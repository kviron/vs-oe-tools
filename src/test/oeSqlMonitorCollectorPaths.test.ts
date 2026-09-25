import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { getSqlMonitorCollectorCandidates, hasCollectorError, isMonitorConnectionError, isProtocolVersionMismatch } from '../features/sql-monitor/oeSqlMonitorCollectorPaths';

suite('OESQLMonCon collector paths', () => {
	test('uses configured collector before workspace and R306 fallbacks', () => {
		const workspace = path.join('C:', 'OE', 'trunk');
		assert.deepEqual(getSqlMonitorCollectorCandidates(workspace, path.join('C:', 'tools', 'sql-monitor')), [
			path.resolve(workspace, path.join('C:', 'tools', 'sql-monitor'), 'OESQLMonCon.exe'),
			path.join(workspace, 'bin', 'OESQLMonCon.exe'),
			path.join(path.dirname(workspace), 'R306', 'bin', 'OESQLMonCon.exe'),
		]);
	});

	test('does not duplicate the standard collector when explicitly configured', () => {
		const workspace = path.join('C:', 'OE', 'trunk');
		const standard = path.join(workspace, 'bin', 'OESQLMonCon.exe');
		assert.equal(getSqlMonitorCollectorCandidates(workspace, standard).length, 2);
	});

	test('recognizes the localized protocol mismatch', () => {
		assert.equal(isProtocolVersionMismatch(new Error('Exception: Неверная версия протокола данных 157.0, ожидается 154.0')), true);
		assert.equal(isProtocolVersionMismatch(new Error('ECONNREFUSED')), false);
	});

	test('recognizes OEService disconnects reported by the native collector', () => {
		assert.equal(hasCollectorError('EOENetworkError: Подключение не установлено (10061)'), true);
		assert.equal(hasCollectorError('Отключение от базы данных...'), false);
		assert.equal(isMonitorConnectionError(new Error('EOENetworkError: Удаленный хост принудительно разорвал существующее подключение(10054)')), true);
		assert.equal(isMonitorConnectionError(new Error('EOENetworkError: Подключение не установлено, т.к. конечный компьютер отверг запрос на подключение(10061)')), true);
		assert.equal(isMonitorConnectionError(new Error('Неверная версия протокола данных 157.0, ожидается 154.0')), false);
	});
});
