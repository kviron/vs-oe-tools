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
exports.productionTaskSql = void 0;
exports.loadProductionTasks = loadProductionTasks;
exports.createLoginParameters = createLoginParameters;
const node_crypto_1 = require("node:crypto");
const net = __importStar(require("node:net"));
const os = __importStar(require("node:os"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const oenpProtocol_1 = require("./oenpProtocol");
exports.productionTaskSql = `SELECT T0.ID AS id,
  COALESCE(CAST(T0.DNumber AS VARCHAR(64)), '') AS number,
  COALESCE(CAST(SO1.FName AS VARCHAR(250)), '') AS state,
  COALESCE(CAST(left(T0.Description, 6000) AS VARCHAR(6000)), '') AS description,
  COALESCE(CAST(DateToStrFmt(T0.CreDate, 'dd.mm.yyyy hh:mm') AS VARCHAR(32)), '') AS created,
  COALESCE(CAST(DateToStrFmt(T0.Deadline, 'dd.mm.yyyy hh:mm') AS VARCHAR(32)), '') AS deadline,
  COALESCE((SELECT CAST(SO2.FName AS VARCHAR(250)) FROM TypeWork SO2 WHERE SO2.ID = T0.Tip), '') AS worktype,
  CAST(COALESCE((SELECT CommaToText(COMMAADDAGG(NotEmptyStr(PD.Number || ' - ', '') || PD.Description), ', ')
    FROM ProjectDoc PD
    WHERE commagetpos((SELECT R.Refs FROM GETREFOBJECTS(T0.ID, 8927966, 8927510) R), PD.ID) > -1), '') AS VARCHAR(6000)) AS project,
  COALESCE((SELECT CAST(C.FullName AS VARCHAR(1000)) FROM Contractor C WHERE C.ID = T0.Customer), '') AS customer,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Executor), '') AS executor,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Initiator), '') AS initiator,
  COALESCE(CAST(left(T0.Comment, 6000) AS VARCHAR(6000)), '') AS comment
FROM WorkDoc T0
LEFT JOIN StateLC SO1 ON SO1.ID=T0.LCStateID
WHERE T0.LCStateID NOT IN (11822369, 8929693, 8929692, 8929694, 11821629)
  AND (T0.Initiator = %CurPerson OR T0.LCStateID <> 11821554)
  AND T0.RespPerson = %CurPerson
ORDER BY CASE WHEN T0.LCStateID IN (11821106, 820069919) THEN 0 ELSE 1 END, T0.OrdPlan
LIMIT 250`;
async function loadProductionTasks(options, logger) {
    const connection = new OenpConnection(options.host, options.port);
    const startedAt = Date.now();
    let stage = 'подключение';
    logger?.info('Начата загрузка задач.', {
        host: options.host, port: options.port, database: options.database, personId: options.personId,
        hasUsername: options.username.length > 0, hasPassword: options.password.length > 0,
        hasClientSessionKey: options.clientSessionKey.length > 0,
    });
    const authCompatibility = inspectAuthorizationCompatibility(options);
    if (authCompatibility) {
        logger?.info('Проверена авторизация по успешному пакету из захвата.', authCompatibility.diagnostics);
    }
    try {
        await connection.connect();
        logger?.info('TCP-соединение установлено.', { elapsedMs: Date.now() - startedAt });
        stage = 'регистрация клиентской сессии';
        await exchangeLogged(connection, (0, oenpProtocol_1.createInitialPacket)(options.clientSessionKey), stage, logger);
        stage = 'проверка версии клиента';
        await exchangeLogged(connection, (0, oenpProtocol_1.createClientVersionPacket)(2), stage, logger);
        stage = 'инициализация протокола';
        await exchangeLogged(connection, (0, oenpProtocol_1.createProtocolInitPacket)(3), stage, logger);
        stage = 'выбор базы';
        await exchangeLogged(connection, (0, oenpProtocol_1.createDatabaseProbePacket)(4), stage, logger);
        stage = 'готовность клиента';
        await exchangeLogged(connection, (0, oenpProtocol_1.createClientReadyPacket)(5), stage, logger);
        stage = 'получение challenge';
        const challenge = (0, oenpProtocol_1.parseChallenge)(await exchangeLogged(connection, (0, oenpProtocol_1.createChallengePacket)(6), stage, logger, false));
        logger?.info('Challenge авторизации получен.', { length: challenge.length });
        stage = 'авторизация';
        await exchangeLogged(connection, (0, oenpProtocol_1.createLoginPacket)(7, createLoginParameters(options, challenge, authCompatibility?.mode, authCompatibility?.username)), stage, logger, false);
        stage = 'запрос списка задач';
        const response = await exchangeLogged(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, exports.productionTaskSql, options.personId), stage, logger);
        stage = 'разбор ответа со списком задач';
        const rows = (0, oenpProtocol_1.parseMemoryDataPacket)(response);
        const tasks = rows.map(row => ({
            id: Number(row.id), number: text(row.number), state: text(row.state), description: text(row.description),
            createdAt: text(row.created), deadline: text(row.deadline), workType: text(row.worktype), project: text(row.project),
            customer: text(row.customer), executor: text(row.executor), initiator: text(row.initiator), comment: text(row.comment),
        }));
        logger?.info('Задачи успешно загружены.', { count: tasks.length, elapsedMs: Date.now() - startedAt });
        return tasks;
    }
    catch (error) {
        logger?.error(`Ошибка на этапе «${stage}».`, {
            ...errorDetails(error), elapsedMs: Date.now() - startedAt,
        });
        throw error;
    }
    finally {
        connection.dispose();
        logger?.info('TCP-соединение закрыто.', { elapsedMs: Date.now() - startedAt });
    }
}
async function exchangeLogged(connection, request, stage, logger, includeResponseHead = true) {
    const requestId = request.readUInt32LE(8);
    const startedAt = Date.now();
    logger?.info(`OENP: отправлен этап «${stage}».`, { requestId, requestBytes: request.length });
    try {
        const response = await connection.exchange(request);
        logger?.info(`OENP: получен ответ на этап «${stage}».`, {
            requestId, responseRequestId: response.length >= 12 ? response.readUInt32LE(8) : undefined,
            responseBytes: response.length, packetType: response.length >= 13 ? response[12] : undefined,
            hasDataSet: response.includes(Buffer.from('MemoryDataPacket', 'ascii')),
            responseHead: includeResponseHead ? response.subarray(0, Math.min(response.length, 64)).toString('hex') : '<скрыто для авторизации>',
            elapsedMs: Date.now() - startedAt,
        });
        if (response.length >= 13 && response[12] === 5) {
            throw new Error((0, oenpProtocol_1.readOenpError)(response) || `Сервер OENP вернул исключение на этапе «${stage}».`);
        }
        return response;
    }
    catch (error) {
        logger?.error(`OENP: обмен завершился ошибкой на этапе «${stage}».`, { requestId, ...errorDetails(error), elapsedMs: Date.now() - startedAt });
        throw error;
    }
}
function errorDetails(error) {
    if (!(error instanceof Error)) {
        return { message: String(error) };
    }
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    return { name: error.name, message: error.message, code, stack: error.stack };
}
function createLoginParameters(options, challenge, mode = { encoding: 'win1251', usernameCase: 'lower' }, username = options.username) {
    const { modern, legacy } = deriveAuthorizationHashes(username, options.password, challenge, mode);
    const windowsVersion = `Windows (${os.release()}, ${process.arch === 'x64' ? '64' : '32'}-bit Edition)`;
    return `host=oesrv,host=${options.host},UpdateUrl=${options.host},DB=${options.database},UserName=${username},Password=${modern},ApplicationName=FME.exe,LogoutOtherSessions=0,OldPassword=${legacy},"ClientOSVersion=${windowsVersion}",ClientTimeZone=Europe/Moscow`;
}
function inspectAuthorizationCompatibility(options) {
    const reference = options.authorizationReference;
    if (!reference) {
        return undefined;
    }
    const modes = [
        { encoding: 'win1251', usernameCase: 'lower' }, { encoding: 'utf8', usernameCase: 'lower' },
        { encoding: 'utf16le', usernameCase: 'lower' },
        { encoding: 'win1251', usernameCase: 'upper' }, { encoding: 'utf8', usernameCase: 'upper' },
        { encoding: 'utf16le', usernameCase: 'upper' }, { encoding: 'win1251', usernameCase: 'original' },
        { encoding: 'utf8', usernameCase: 'original' }, { encoding: 'utf16le', usernameCase: 'original' },
    ];
    const usernames = [...new Set([options.username, reference.username])];
    const matches = usernames.flatMap(username => modes.map(mode => ({ username, mode }))).filter(candidate => {
        const hashes = deriveAuthorizationHashes(candidate.username, options.password, reference.challenge, candidate.mode);
        return hashes.modern === reference.passwordHash && hashes.legacy === reference.oldPasswordHash;
    });
    return {
        mode: matches[0]?.mode,
        username: matches[0]?.username,
        diagnostics: {
            referenceFound: true,
            usernameMatches: options.username === reference.username,
            usernameMatchesIgnoringCase: options.username.toLocaleUpperCase('ru-RU') === reference.username.toLocaleUpperCase('ru-RU'),
            passwordLooksLikeHash: /^[A-F\d]{32}$/i.test(options.password),
            hashAlgorithmMatched: matches.length > 0,
            usedUsernameFromCapture: matches[0] ? matches[0].username === reference.username && options.username !== reference.username : false,
            selectedEncoding: matches[0]?.mode.encoding,
            selectedUsernameCase: matches[0]?.mode.usernameCase,
        },
    };
}
function deriveAuthorizationHashes(username, password, challenge, mode) {
    const normalizedUsername = mode.usernameCase === 'lower'
        ? username.toLocaleLowerCase('ru-RU')
        : mode.usernameCase === 'upper' ? username.toLocaleUpperCase('ru-RU') : username;
    const hash = (value) => (0, node_crypto_1.createHash)('md5').update(iconv_lite_1.default.encode(value, mode.encoding)).digest('hex').toUpperCase();
    const privatePassword = hash(`${normalizedUsername}:${password}`);
    const oldPrivatePassword = hash(password).slice(0, 30);
    return {
        modern: hash(`${challenge}${privatePassword}`),
        legacy: hash(`${challenge}${normalizedUsername}:${oldPrivatePassword}`),
    };
}
function text(value) { return value === null || value === undefined ? '' : String(value); }
class OenpConnection {
    host;
    port;
    socket;
    pending = Buffer.alloc(0);
    constructor(host, port) {
        this.host = host;
        this.port = port;
    }
    connect() {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host: this.host, port: this.port });
            this.socket = socket;
            socket.setTimeout(15_000);
            socket.once('connect', resolve);
            socket.once('error', reject);
            socket.once('timeout', () => reject(new Error(`Тайм-аут подключения к ${this.host}:${this.port}.`)));
        });
    }
    exchange(request) {
        const socket = this.socket;
        if (!socket) {
            return Promise.reject(new Error('Соединение OENP не открыто.'));
        }
        return new Promise((resolve, reject) => {
            let required = 0;
            const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('timeout', onTimeout); };
            const onError = (error) => { cleanup(); reject(error); };
            const onTimeout = () => onError(new Error('Сервер Восточного Экспресса не ответил вовремя.'));
            const onData = (chunk) => {
                this.pending = Buffer.concat([this.pending, chunk]);
                if (!required && this.pending.length >= 8) {
                    required = (0, oenpProtocol_1.expectedPacketLength)(this.pending);
                }
                if (required && this.pending.length >= required) {
                    const response = this.pending.subarray(0, required);
                    this.pending = this.pending.subarray(required);
                    cleanup();
                    resolve(response);
                }
            };
            socket.on('data', onData);
            socket.once('error', onError);
            socket.once('timeout', onTimeout);
            socket.write(request);
        });
    }
    dispose() { this.socket?.destroy(); this.socket = undefined; }
}
//# sourceMappingURL=productionTasksRepository.js.map