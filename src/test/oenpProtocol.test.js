"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("node:assert/strict"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const oenpProtocol_1 = require("../features/production-tasks/oenpProtocol");
const productionTasksRepository_1 = require("../features/production-tasks/productionTasksRepository");
suite('OENP protocol', () => {
    test('builds a framed read-only query', () => {
        const packet = (0, oenpProtocol_1.createReadonlyQueryPacket)(25, 'SELECT ID FROM WorkDoc', 123456789);
        assert.equal(packet.subarray(0, 4).toString('ascii'), 'OENP');
        assert.equal((0, oenpProtocol_1.expectedPacketLength)(packet), packet.length);
        assert.equal(packet.readUInt32LE(8), 25);
        assert.equal(packet.indexOf(Buffer.from('SELECT ID FROM WorkDoc\r\n', 'ascii')) > 0, true);
        const person = packet.indexOf(Buffer.from('CurPerson', 'utf16le')) + Buffer.byteLength('CurPerson', 'utf16le') + 6;
        assert.equal(packet.subarray(person, person + 18).toString('utf16le'), '123456789');
        assert.equal(packet.subarray(person + 18, person + 22).toString('hex'), '0c200000');
        assert.throws(() => (0, oenpProtocol_1.createReadonlyQueryPacket)(1, 'UPDATE WorkDoc SET ID=ID', 123456789), /только один SELECT/);
    });
    test('uses casts accepted by the East Express SQL parser', () => {
        assert.equal(productionTasksRepository_1.productionTaskSql.includes('::'), false);
        assert.equal(productionTasksRepository_1.productionTaskSql.toLowerCase().includes('to_char('), false);
        assert.match(productionTasksRepository_1.productionTaskSql, /CAST\(T0\.DNumber AS VARCHAR\(64\)\)/);
        assert.match(productionTasksRepository_1.productionTaskSql, /DateToStrFmt\(T0\.CreDate, 'dd\.mm\.yyyy hh:mm:ss'\)/);
        assert.match(productionTasksRepository_1.productionTaskSql, /DateToStrFmt\(T0\.Deadline, 'dd\.mm\.yyyy hh:mm:ss'\)/);
        assert.match(productionTasksRepository_1.productionTaskSql, /FROM StructureActivity SA WHERE SA\.ID = T0\.KindActivity/);
        assert.match(productionTasksRepository_1.productionTaskSql, /FROM HistoryLC H WHERE H\.ID = T0\.LCLastActionID/);
        assert.match(productionTasksRepository_1.productionTaskSql, /CAST\(\(SELECT COUNT\(SF\.ID\)[\s\S]+AS VARCHAR\(64\)\), '0'\) AS attachmentcount/);
    });
    test('builds a bounded attachment query for the exact task', () => {
        const sql = (0, productionTasksRepository_1.productionTaskAttachmentsSql)(85008);
        assert.match(sql, /FROM StoredFiles SF/);
        assert.match(sql, /WHERE SF\.SeniorID = 85008/);
        assert.match(sql, /SF\.RootObj = 85008/);
        assert.match(sql, /SF\.MainStoredFile IN/);
        assert.match(sql, /LIMIT 250$/);
        assert.throws(() => (0, productionTasksRepository_1.productionTaskAttachmentsSql)(0), /положительным целым/);
    });
    test('builds a bounded read-only lifecycle history query', () => {
        const sql = (0, productionTasksRepository_1.productionTaskHistorySql)(934593105);
        assert.match(sql, /FROM HistoryLC H/);
        assert.match(sql, /LEFT JOIN ActionLC A ON A\.ID = H\.ActionID/);
        assert.match(sql, /LEFT JOIN StateLC S ON S\.ID = H\.EndState/);
        assert.match(sql, /WHERE H\.SeniorID = 934593105/);
        assert.match(sql, /LIMIT 250$/);
        assert.throws(() => (0, productionTasksRepository_1.productionTaskHistorySql)(-1), /положительным целым/);
    });
    test('builds a bounded task preview query by number or ID', () => {
        const sql = (0, productionTasksRepository_1.productionTaskReferenceSql)(88605);
        assert.match(sql, /FROM WorkDoc T0/);
        assert.match(sql, /WHERE T0\.DNumber = 88605 OR T0\.ID = 88605/);
        assert.match(sql, /LIMIT 1$/);
        assert.throws(() => (0, productionTasksRepository_1.productionTaskReferenceSql)(0), /положительным целым/);
    });
    test('hides the zero Delphi date', () => {
        assert.equal((0, productionTasksRepository_1.normalizeProductionDate)('30.12.1899 00:00'), '');
        assert.equal((0, productionTasksRepository_1.normalizeProductionDate)('30.12.1899 00:00:00'), '');
        assert.equal((0, productionTasksRepository_1.normalizeProductionDate)('09.10.2025 09:56:20'), '09.10.2025 09:56:20');
    });
    test('decodes a bytea project name from Windows-1251', () => {
        const project = 'Отразить в аудите';
        const encoded = `\\x${iconv_lite_1.default.encode(project, 'win1251').toString('hex')}`;
        assert.equal((0, productionTasksRepository_1.decodeProductionText)(encoded), project);
        assert.equal((0, productionTasksRepository_1.decodeProductionText)('Обычный проект'), 'Обычный проект');
        assert.equal((0, productionTasksRepository_1.decodeProductionText)('\\x123'), '\\x123');
    });
    test('builds the registered-session packet and reads an authorization challenge', () => {
        const packet = (0, oenpProtocol_1.createInitialPacket)('00112233445566778899AABBCCDDEEFF');
        assert.equal(packet.subarray(16, 32).toString('hex'), '00112233445566778899aabbccddeeff');
        assert.throws(() => (0, oenpProtocol_1.createInitialPacket)('invalid'), /32-значный ключ/);
        const response = Buffer.from('4f454e502900000006000000002500000020413836463744313639334539313838464233374142413935373644383038444300000000', 'hex');
        assert.equal((0, oenpProtocol_1.parseChallenge)(response), 'A86F7D1693E9188FB37ABA9576D808DC');
        assert.equal((0, oenpProtocol_1.extractClientSessionKey)(Buffer.concat([Buffer.from([1, 2, 3]), packet])), '00112233445566778899aabbccddeeff');
        const personRecord = Buffer.concat([Buffer.from('CurPerson', 'utf16le'), Buffer.from('080009000000', 'hex'), Buffer.from('123456789', 'utf16le')]);
        assert.equal((0, oenpProtocol_1.extractCurrentPersonId)(personRecord), 123456789);
    });
    test('derives current and legacy challenge-response passwords', () => {
        const parameters = (0, productionTasksRepository_1.createLoginParameters)({
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
        assert.deepEqual((0, oenpProtocol_1.extractCapturedAuthorization)(Buffer.concat([challengePacket, login])), {
            username: 'tester', challenge,
            passwordHash: 'F1C1827BF976763EB127B84A184D4995', oldPasswordHash: 'F94C1936F2D11D035E8F30336A4399A8',
        });
    });
    test('decodes integer, Windows-1251 text, and null fields', () => {
        const packet = Buffer.from('4f454e50bf0000002103000000bb00000000000000000000000102000000104d656d6f7279446174615061636b6574' +
            '0202000101012200000502696403000000046173716c0f00000004636f6e640f00000007636f6e64696e740f000000' +
            '07636c6173736964030000000100020000000113009f3b88001e00000054302e72657370706572736f6e203d202543' +
            '757272656e74506572736f6e639c0000011300f88b9a001c00000054302e6578656375746f72203d20254375727265' +
            '6e74506572736f6e639c000000000000', 'hex');
        assert.deepEqual((0, oenpProtocol_1.parseMemoryDataPacket)(packet), [
            { id: 8928159, asql: 'T0.respperson = %CurrentPerson', cond: null, condint: null, classid: 40035 },
            { id: 10128376, asql: 'T0.executor = %CurrentPerson', cond: null, condint: null, classid: 40035 },
        ]);
    });
    test('decodes Delphi WideString fields', () => {
        const text = 'Задача № 42';
        const packet = Buffer.concat([
            Buffer.from('MemoryDataPacket', 'ascii'),
            Buffer.alloc(9), Buffer.from([2]),
            Buffer.from([2]), Buffer.from('id', 'ascii'), Buffer.from([3, 0, 0, 0]),
            Buffer.from([6]), Buffer.from('number', 'ascii'), Buffer.from([24, 64, 0, 0]),
            Buffer.alloc(2), Buffer.from([1, 0, 0, 0]),
            Buffer.from([1, 3, 0]), Buffer.from([42, 0, 0, 0]),
            Buffer.from([text.length]), Buffer.from(text, 'utf16le'),
        ]);
        assert.deepEqual((0, oenpProtocol_1.parseMemoryDataPacket)(packet), [{ id: 42, number: text }]);
    });
    test('decodes WideString metadata with a packed maximum length', () => {
        const text = 'Длинное описание';
        const packet = Buffer.concat([
            Buffer.from('MemoryDataPacket', 'ascii'),
            Buffer.alloc(9), Buffer.from([2]),
            Buffer.from([2]), Buffer.from('id', 'ascii'), Buffer.from([3, 0, 0, 0]),
            Buffer.from([11]), Buffer.from('description', 'ascii'), Buffer.from([24, 0xfd, 0x70, 0x17, 0, 0]),
            Buffer.alloc(2), Buffer.from([1, 0, 0, 0]),
            Buffer.from([1, 3, 0]), Buffer.from([42, 0, 0, 0]),
            Buffer.from([text.length]), Buffer.from(text, 'utf16le'),
        ]);
        assert.deepEqual((0, oenpProtocol_1.parseMemoryDataPacket)(packet), [{ id: 42, description: text }]);
    });
    test('decodes the second row bitmap', () => {
        const text = 'Задача в работе';
        const packet = Buffer.concat([
            Buffer.from('MemoryDataPacket', 'ascii'),
            Buffer.alloc(9), Buffer.from([2]),
            Buffer.from([2]), Buffer.from('id', 'ascii'), Buffer.from([3, 0, 0, 0]),
            Buffer.from([5]), Buffer.from('title', 'ascii'), Buffer.from([24, 64, 0, 0]),
            Buffer.alloc(2), Buffer.from([1, 0, 0, 0]),
            Buffer.from([1, 3, 0]), Buffer.from([42, 0, 0, 0]),
            Buffer.from([text.length]), Buffer.from(text, 'utf16le'),
        ]);
        assert.deepEqual((0, oenpProtocol_1.parseMemoryDataPacket)(packet), [{ id: 42, title: text }]);
    });
    test('scales both row bitmaps for 26 production fields', () => {
        const fieldMetadata = Buffer.concat(Array.from({ length: 26 }, (_, index) => {
            const name = `f${index}`;
            return Buffer.concat([Buffer.from([name.length]), Buffer.from(name, 'ascii'), Buffer.from([3, 0, 0, 0])]);
        }));
        const values = Buffer.alloc(26 * 4);
        for (let index = 0; index < 26; index += 1) {
            values.writeInt32LE(index + 100, index * 4);
        }
        const packet = Buffer.concat([
            Buffer.from('MemoryDataPacket', 'ascii'), Buffer.alloc(9), Buffer.from([26]), fieldMetadata,
            Buffer.alloc(2), Buffer.from([1, 0, 0, 0]),
            Buffer.from([1]), Buffer.from([0xff, 0xff, 0xff, 0x03]), Buffer.alloc(4), values,
        ]);
        const expected = Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`f${index}`, index + 100]));
        assert.deepEqual((0, oenpProtocol_1.parseMemoryDataPacket)(packet), [expected]);
    });
    test('keeps production field and row boundaries after Cyrillic values', () => {
        const encode = (value) => Buffer.concat([Buffer.from([value.length]), Buffer.from(value, 'utf16le')]);
        const packet = Buffer.concat([
            Buffer.from('MemoryDataPacket', 'ascii'),
            Buffer.alloc(9), Buffer.from([3]),
            Buffer.from([2]), Buffer.from('id', 'ascii'), Buffer.from([3, 0, 0, 0]),
            Buffer.from([5]), Buffer.from('title', 'ascii'), Buffer.from([24, 64, 0, 0]),
            Buffer.from([7]), Buffer.from('created', 'ascii'), Buffer.from([24, 32, 0, 0]),
            Buffer.alloc(2), Buffer.from([2, 0, 0, 0]),
            Buffer.from([1, 7, 0]), Buffer.from([42, 0, 0, 0]), encode('Задача № 42'), encode('09.10.2025 09:56'),
            Buffer.from([1, 7, 0]), Buffer.from([43, 0, 0, 0]), encode('Ещё задача'), encode('10.10.2025 10:00'),
        ]);
        assert.deepEqual((0, oenpProtocol_1.parseMemoryDataPacket)(packet), [
            { id: 42, title: 'Задача № 42', created: '09.10.2025 09:56' },
            { id: 43, title: 'Ещё задача', created: '10.10.2025 10:00' },
        ]);
    });
});
//# sourceMappingURL=oenpProtocol.test.js.map