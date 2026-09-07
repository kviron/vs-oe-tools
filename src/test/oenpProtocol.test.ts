import * as assert from 'node:assert/strict';
import { createInitialPacket, createReadonlyQueryPacket, expectedPacketLength, extractCapturedAuthorization, extractClientSessionKey, extractCurrentPersonId, parseChallenge, parseMemoryDataPacket } from '../features/production-tasks/oenpProtocol';
import { createLoginParameters, productionTaskSql } from '../features/production-tasks/productionTasksRepository';

suite('OENP protocol', () => {
	test('builds a framed read-only query', () => {
		const packet = createReadonlyQueryPacket(25, 'SELECT ID FROM WorkDoc', 123456789);
		assert.equal(packet.subarray(0, 4).toString('ascii'), 'OENP');
		assert.equal(expectedPacketLength(packet), packet.length);
		assert.equal(packet.readUInt32LE(8), 25);
		assert.equal(packet.indexOf(Buffer.from('SELECT ID FROM WorkDoc\r\n', 'ascii')) > 0, true);
		const person = packet.indexOf(Buffer.from('CurPerson', 'utf16le')) + Buffer.byteLength('CurPerson', 'utf16le') + 6;
		assert.equal(packet.subarray(person, person + 18).toString('utf16le'), '123456789');
		assert.equal(packet.subarray(person + 18, person + 22).toString('hex'), '0c200000');
		assert.throws(() => createReadonlyQueryPacket(1, 'UPDATE WorkDoc SET ID=ID', 123456789), /только один SELECT/);
	});

	test('uses casts accepted by the East Express SQL parser', () => {
		assert.equal(productionTaskSql.includes('::'), false);
		assert.equal(productionTaskSql.toLowerCase().includes('to_char('), false);
		assert.match(productionTaskSql, /CAST\(T0\.DNumber AS VARCHAR\(64\)\)/);
		assert.match(productionTaskSql, /DateToStrFmt\(T0\.CreDate, 'dd\.mm\.yyyy hh:mm'\)/);
		assert.match(productionTaskSql, /DateToStrFmt\(T0\.Deadline, 'dd\.mm\.yyyy hh:mm'\)/);
	});

	test('builds the registered-session packet and reads an authorization challenge', () => {
		const packet = createInitialPacket('00112233445566778899AABBCCDDEEFF');
		assert.equal(packet.subarray(16, 32).toString('hex'), '00112233445566778899aabbccddeeff');
		assert.throws(() => createInitialPacket('invalid'), /32-значный ключ/);
		const response = Buffer.from('4f454e502900000006000000002500000020413836463744313639334539313838464233374142413935373644383038444300000000', 'hex');
		assert.equal(parseChallenge(response), 'A86F7D1693E9188FB37ABA9576D808DC');
		assert.equal(extractClientSessionKey(Buffer.concat([Buffer.from([1, 2, 3]), packet])), '00112233445566778899aabbccddeeff');
		const personRecord = Buffer.concat([Buffer.from('CurPerson', 'utf16le'), Buffer.from('080009000000', 'hex'), Buffer.from('123456789', 'utf16le')]);
		assert.equal(extractCurrentPersonId(personRecord), 123456789);
	});

	test('derives current and legacy challenge-response passwords', () => {
		const parameters = createLoginParameters({
			host: 'server', port: 3060, database: 'db', clientSessionKey: '0'.repeat(32),
			username: 'tester', password: 'secret', personId: 123456789,
		}, '0123456789ABCDEF0123456789ABCDEF');
		assert.match(parameters, /Password=3ED96D35B9778F32899FFB01D5EE100A/);
		assert.match(parameters, /OldPassword=5EB5453528469984D86CED1BF4700EF2/);
		assert.equal(parameters.includes('secret'), false);
	});

	test('extracts a successful authorization reference without exposing it to logs', () => {
		const challenge = '0123456789ABCDEF0123456789ABCDEF';
		const challengePacket = Buffer.from(`4f454e502900000006000000002500000020${Buffer.from(challenge).toString('hex')}00000000`, 'hex');
		const login = Buffer.from('UserName=tester,Password=F1C1827BF976763EB127B84A184D4995,ApplicationName=FME.exe,LogoutOtherSessions=0,OldPassword=F94C1936F2D11D035E8F30336A4399A8', 'ascii');
		assert.deepEqual(extractCapturedAuthorization(Buffer.concat([challengePacket, login])), {
			username: 'tester', challenge,
			passwordHash: 'F1C1827BF976763EB127B84A184D4995', oldPasswordHash: 'F94C1936F2D11D035E8F30336A4399A8',
		});
	});

	test('decodes integer, Windows-1251 text, and null fields', () => {
		const packet = Buffer.from(
			'4f454e50bf0000002103000000bb00000000000000000000000102000000104d656d6f7279446174615061636b6574' +
			'0202000101012200000502696403000000046173716c0f00000004636f6e640f00000007636f6e64696e740f000000' +
			'07636c6173736964030000000100020000000113009f3b88001e00000054302e72657370706572736f6e203d202543' +
			'757272656e74506572736f6e639c0000011300f88b9a001c00000054302e6578656375746f72203d20254375727265' +
			'6e74506572736f6e639c000000000000',
			'hex',
		);
		assert.deepEqual(parseMemoryDataPacket(packet), [
			{ id: 8928159, asql: 'T0.respperson = %CurrentPerson', cond: null, condint: null, classid: 40035 },
			{ id: 10128376, asql: 'T0.executor = %CurrentPerson', cond: null, condint: null, classid: 40035 },
		]);
	});
});
