import * as assert from 'node:assert/strict';
import { buildLifecycleMethodParameter } from '../features/lifecycle/lifecycleMethodExecution';
import { buildClientMcpStartArguments, buildHttpTestServerArguments, buildHttpTestServerMethodParameter, buildOeExecTaskArguments } from '../features/lifecycle/oeStaticMethodExecutor';

suite('Lifecycle method execution', () => {
	test('builds the native MethodParam value', () => {
		assert.equal(buildLifecycleMethodParameter({
			name: 'СвязанныеОбъекты_Просмотр', displayName: 'Связанные объекты (просмотр)',
			kindId: 8927425, ownerClassId: 12857713,
		}), 'paramName=СвязанныеОбъекты_Просмотр,paramFName=Связанные объекты (просмотр),paramKind=8927425,paramLCSenior=12857713');
	});

	test('quotes complete parameter-list pairs that contain commas', () => {
		assert.match(buildLifecycleMethodParameter({
			name: 'A', displayName: 'A', kindId: 8927425, ownerClassId: 12857713,
			roleIds: [12858357, 12858367],
		}), /,"paramRole=12858357,12858367"/u);
	});

	test('builds OEExecTask arguments without a shell', () => {
		assert.deepEqual(buildOeExecTaskArguments(3143815, 'paramName=A,paramKind=8927425', 'oetest', 'localhost', { username: 'dev', password: 'secret' }, 754321), [
			'-l', 'host=localhost,db=oetest,MultiLogin=True,Username=dev,password=secret', '-MethodID=754321',
			'-MethodParam=paramName=A,paramKind=8927425', '-ForceOutputOEM',
		]);
	});

	test('builds the Функции_IDE MCP startup arguments in configuration mode', () => {
		assert.deepEqual(buildClientMcpStartArguments('oetrunk', 'localhost', { username: 'dev', password: 'secret' }, 754322), [
			'-l', 'host=localhost,db=oetrunk,MultiLogin=True,Username=dev,password=secret,Shell=Настройка',
			'-MethodID=754322',
			'-MethodParam=1',
			'-ForceOutputOEM',
		]);
	});

	test('builds native HTTP method test server arguments', () => {
		assert.deepEqual(buildHttpTestServerArguments('ПолучитьФайл', 'oetrunk', 'localhost', { username: 'dev', password: 'secret' }, 754323), [
			'-l', 'host=localhost,db=oetrunk,MultiLogin=True,Username=dev,password=secret,Shell=Настройка',
			'-MethodID=754323',
			'-MethodParam=method=ПолучитьФайл,username=dev',
			'-ForceOutputOEM',
		]);
		assert.throws(
			() => buildHttpTestServerArguments('*', 'oetrunk', 'localhost', { username: 'dev', password: 'secret' }, 754323),
			/Выберите конкретный HTTP-метод/u,
		);
	});

	test('passes the authenticated client login in the HTTP server method parameter', () => {
		assert.equal(buildHttpTestServerMethodParameter(' Метод ', ' ВЭ_Разработчик '), 'method=Метод,username=ВЭ_Разработчик');
		assert.throws(() => buildHttpTestServerMethodParameter('Метод', 'user,admin'), /Логин клиента/);
	});

	test('rejects command delimiters in user text', () => {
		assert.throws(() => buildLifecycleMethodParameter({
			name: 'A; commit work', displayName: 'A', kindId: 8927425, ownerClassId: 12857713,
		}), /недопустимый символ/);
	});

	test('rejects non-allowlisted method IDs', () => {
		assert.throws(() => buildOeExecTaskArguments(12958243, 'value', 'oetest', 'localhost', { username: 'dev', password: 'secret' }, 754321), /не разрешён/);
	});
});
