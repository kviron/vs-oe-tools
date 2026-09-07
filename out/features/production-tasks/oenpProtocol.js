"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOenpPacket = createOenpPacket;
exports.createInitialPacket = createInitialPacket;
exports.extractClientSessionKey = extractClientSessionKey;
exports.extractCurrentPersonId = extractCurrentPersonId;
exports.extractCapturedAuthorization = extractCapturedAuthorization;
exports.createClientVersionPacket = createClientVersionPacket;
exports.createProtocolInitPacket = createProtocolInitPacket;
exports.createDatabaseProbePacket = createDatabaseProbePacket;
exports.createClientReadyPacket = createClientReadyPacket;
exports.createChallengePacket = createChallengePacket;
exports.parseChallenge = parseChallenge;
exports.createLoginPacket = createLoginPacket;
exports.createReadonlyQueryPacket = createReadonlyQueryPacket;
exports.expectedPacketLength = expectedPacketLength;
exports.parseMemoryDataPacket = parseMemoryDataPacket;
exports.readOenpError = readOenpError;
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const requestTrailer = Buffer.from('00000000000000000c2000000100000000000000020000000c20000001000000' +
    '000000000100000003000a0000000b00ffff0c20000001000000000000000200' +
    '000003000700000008000900000043007500720050006500720073006f006e00' +
    '0800090000000000000000000000000000000000000000000c20000001000000' +
    '00000000010000000300050000000700000000000098e6400064000000000000' +
    '000000000003000000', 'hex');
function createOenpPacket(requestId, operation, body = Buffer.alloc(0)) {
    const packet = Buffer.alloc(30 + operation.length + body.length);
    packet.write('OENP', 0, 'ascii');
    packet.writeUInt32LE(packet.length - 13, 4);
    packet.writeUInt32LE(requestId, 8);
    packet[12] = 3;
    operation.copy(packet, 30);
    body.copy(packet, 30 + operation.length);
    return packet;
}
function createInitialPacket(clientSessionKey) {
    const normalized = clientSessionKey.replace(/[{}\s-]/g, '');
    if (!/^[a-f\d]{32}$/i.test(normalized)) {
        throw new Error('Укажите 32-значный ключ клиентской сессии OENP в vcVeTools.productionClientSessionKey.');
    }
    const packet = Buffer.alloc(36);
    packet.write('OENP', 0, 'ascii');
    packet.writeUInt32LE(23, 4);
    packet.writeUInt32LE(1, 8);
    packet[12] = 1;
    packet.writeUInt16LE(157, 13);
    Buffer.from(normalized, 'hex').copy(packet, 16);
    return packet;
}
function extractClientSessionKey(capture) {
    const prefix = Buffer.from('4f454e501700000001000000019d0000', 'hex');
    const offset = capture.indexOf(prefix);
    if (offset < 0 || offset + 32 > capture.length) {
        return undefined;
    }
    return capture.subarray(offset + prefix.length, offset + prefix.length + 16).toString('hex');
}
function extractCurrentPersonId(capture) {
    const name = Buffer.from('CurPerson', 'utf16le');
    const valueHeader = Buffer.from('080009000000', 'hex');
    let offset = 0;
    while ((offset = capture.indexOf(name, offset)) >= 0) {
        const headerOffset = offset + name.length;
        if (capture.subarray(headerOffset, headerOffset + valueHeader.length).equals(valueHeader)) {
            const value = capture.subarray(headerOffset + valueHeader.length, headerOffset + valueHeader.length + 18).toString('utf16le');
            if (/^\d{9}$/.test(value)) {
                return Number(value);
            }
        }
        offset += name.length;
    }
    return undefined;
}
function extractCapturedAuthorization(capture) {
    const decoded = iconv_lite_1.default.decode(capture, 'win1251');
    const login = decoded.match(/UserName=([^,\x00]+),Password=([A-F\d]{32}),ApplicationName=[^,\x00]+,LogoutOtherSessions=\d+,OldPassword=([A-F\d]{32})/i);
    if (!login) {
        return undefined;
    }
    let challenge;
    let offset = 0;
    while ((offset = capture.indexOf('OENP', offset, 'ascii')) >= 0) {
        if (offset + 13 <= capture.length && capture.readUInt32LE(offset + 8) === 6 && capture[offset + 12] === 0) {
            const packetLength = capture.readUInt32LE(offset + 4) + 13;
            if (packetLength >= 13 && offset + packetLength <= capture.length) {
                const match = capture.subarray(offset + 13, offset + packetLength).toString('ascii').match(/[A-F\d]{32}/i);
                if (match) {
                    challenge = match[0].toUpperCase();
                    break;
                }
            }
        }
        offset += 4;
    }
    if (!challenge) {
        return undefined;
    }
    return {
        username: login[1], challenge,
        passwordHash: login[2].toUpperCase(), oldPasswordHash: login[3].toUpperCase(),
    };
}
function createClientVersionPacket(requestId) {
    return createOenpPacket(requestId, Buffer.from('fdf501', 'hex'), Buffer.from('2014312e3020283529205b332e372e302e373538305d0000fe0000008007000000', 'hex'));
}
function createProtocolInitPacket(requestId) {
    return createOenpPacket(requestId, Buffer.from('fdf001', 'hex'), Buffer.from('0700000003000000', 'hex'));
}
function createDatabaseProbePacket(requestId) {
    return createOenpPacket(requestId, Buffer.from('fd9801', 'hex'), Buffer.from('080100000003000000', 'hex'));
}
function createClientReadyPacket(requestId) {
    return createOenpPacket(requestId, Buffer.from('fdf401', 'hex'), Buffer.from([0]));
}
function createChallengePacket(requestId) {
    return createOenpPacket(requestId, Buffer.from([0x07]), Buffer.from([0x07, 0, 0, 0, 3, 0, 0, 0]));
}
function parseChallenge(packet) {
    const match = iconv_lite_1.default.decode(packet.subarray(13), 'ascii').match(/[A-F\d]{32}/i);
    if (!match) {
        throw new Error(readOenpError(packet) || 'Сервер не вернул ключ авторизации.');
    }
    return match[0].toUpperCase();
}
function createLoginPacket(requestId, parameters) {
    const value = iconv_lite_1.default.encode(parameters, 'win1251');
    const encodedValue = Buffer.concat([Buffer.from([0xff]), uint32(value.length)]);
    const trailer = Buffer.from([0, 0, 0, 3, 0, 0, 0]);
    const payload = Buffer.concat([encodedValue, value, trailer]);
    return createOenpPacket(requestId, Buffer.from([0x01]), Buffer.concat([packedLength(payload.length), payload]));
}
function createReadonlyQueryPacket(requestId, sql, personId) {
    if (!/^\s*select\b/i.test(sql) || /;\s*\S/.test(sql)) {
        throw new Error('OENP допускает только один SELECT-запрос.');
    }
    const query = Buffer.from(sql.endsWith('\r\n') ? sql : `${sql}\r\n`, 'ascii');
    const person = String(personId);
    const trailer = Buffer.from(requestTrailer);
    const replacement = Buffer.from([...person].flatMap(char => [char.charCodeAt(0), 0]));
    const personValueOffset = 102;
    if (replacement.length !== 18) {
        throw new Error('ID исполнителя должен состоять из девяти цифр.');
    }
    replacement.copy(trailer, personValueOffset);
    const encodedQuery = Buffer.concat([Buffer.from([0xff]), uint32(query.length), query]);
    const payload = Buffer.concat([encodedQuery, trailer]);
    return createOenpPacket(requestId, Buffer.from([0xfd, 0x93, 0x01]), Buffer.concat([packedLength(payload.length), payload]));
}
function expectedPacketLength(header) {
    if (header.length < 8 || header.subarray(0, 4).toString('ascii') !== 'OENP') {
        throw new Error('Сервер вернул ответ неизвестного формата.');
    }
    return header.readUInt32LE(4) + 13;
}
function parseMemoryDataPacket(packet) {
    const signature = Buffer.from('MemoryDataPacket', 'ascii');
    const signatureAt = packet.indexOf(signature);
    if (signatureAt < 0) {
        throw new Error(readOenpError(packet) || 'В ответе сервера нет набора данных.');
    }
    let offset = signatureAt + signature.length + 9;
    const fieldCount = packet[offset++];
    const fields = [];
    for (let index = 0; index < fieldCount; index += 1) {
        const nameLength = packet[offset++];
        const name = packet.subarray(offset, offset + nameLength).toString('ascii').toLowerCase();
        offset += nameLength;
        const type = packet[offset];
        if (type !== 3 && type !== 15) {
            throw new Error(`Неподдерживаемый тип поля ${name}: ${type}.`);
        }
        offset += 4;
        fields.push({ name, type });
    }
    offset += 2;
    const rowCount = packet.readUInt32LE(offset);
    offset += 4;
    const rows = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        offset += 1;
        const present = packet.subarray(offset, offset + Math.ceil(fieldCount / 8));
        offset += present.length;
        // DataPacket stores an additional row bookmark byte before field values.
        offset += 1;
        const row = {};
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
            const field = fields[fieldIndex];
            if ((present[Math.floor(fieldIndex / 8)] & (1 << (fieldIndex % 8))) === 0) {
                row[field.name] = null;
                continue;
            }
            if (field.type === 3) {
                row[field.name] = packet.readInt32LE(offset);
                offset += 4;
            }
            else {
                const length = packet.readUInt32LE(offset);
                offset += 4;
                row[field.name] = iconv_lite_1.default.decode(packet.subarray(offset, offset + length), 'win1251');
                offset += length;
            }
        }
        rows.push(row);
    }
    return rows;
}
function packedLength(value) {
    if (value < 0xfd) {
        return Buffer.from([value]);
    }
    if (value <= 0xffff) {
        const result = Buffer.alloc(3);
        result[0] = 0xfd;
        result.writeUInt16LE(value, 1);
        return result;
    }
    return Buffer.concat([Buffer.from([0xff]), uint32(value)]);
}
function uint32(value) { const result = Buffer.alloc(4); result.writeUInt32LE(value); return result; }
function readOenpError(packet) {
    const decoded = iconv_lite_1.default.decode(packet.subarray(13), 'win1251').replace(/[\x00-\x1f]+/g, ' ').trim();
    return decoded.length > 4 ? decoded.slice(0, 500) : '';
}
//# sourceMappingURL=oenpProtocol.js.map