import { createHash } from 'node:crypto';
import * as net from 'node:net';
import * as os from 'node:os';
import iconv from 'iconv-lite';
import type { CapturedAuthorization, ProductionConnectionOptions, ProductionTasksLogger, ProductionTaskSummary } from './models';
import { createChallengePacket, createClientReadyPacket, createClientVersionPacket, createDatabaseProbePacket, createInitialPacket, createLoginPacket, createProtocolInitPacket, createReadonlyQueryPacket, expectedPacketLength, parseChallenge, parseMemoryDataPacket, readOenpError } from './oenpProtocol';

export const productionTaskSql = `SELECT T0.ID AS id,
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

export async function loadProductionTasks(options: ProductionConnectionOptions, logger?: ProductionTasksLogger): Promise<ProductionTaskSummary[]> {
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
		await exchangeLogged(connection, createInitialPacket(options.clientSessionKey), stage, logger);
		stage = 'проверка версии клиента';
		await exchangeLogged(connection, createClientVersionPacket(2), stage, logger);
		stage = 'инициализация протокола';
		await exchangeLogged(connection, createProtocolInitPacket(3), stage, logger);
		stage = 'выбор базы';
		await exchangeLogged(connection, createDatabaseProbePacket(4), stage, logger);
		stage = 'готовность клиента';
		await exchangeLogged(connection, createClientReadyPacket(5), stage, logger);
		stage = 'получение challenge';
		const challenge = parseChallenge(await exchangeLogged(connection, createChallengePacket(6), stage, logger, false));
		logger?.info('Challenge авторизации получен.', { length: challenge.length });
		stage = 'авторизация';
		await exchangeLogged(connection, createLoginPacket(7, createLoginParameters(options, challenge, authCompatibility?.mode, authCompatibility?.username)), stage, logger, false);
		stage = 'запрос списка задач';
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskSql, options.personId), stage, logger);
		stage = 'разбор ответа со списком задач';
		const rows = parseMemoryDataPacket(response);
		const tasks = rows.map(row => ({
			id: Number(row.id), number: text(row.number), state: text(row.state), description: text(row.description),
			createdAt: text(row.created), deadline: text(row.deadline), workType: text(row.worktype), project: text(row.project),
			customer: text(row.customer), executor: text(row.executor), initiator: text(row.initiator), comment: text(row.comment),
		}));
		logger?.info('Задачи успешно загружены.', { count: tasks.length, elapsedMs: Date.now() - startedAt });
		return tasks;
	} catch (error) {
		logger?.error(`Ошибка на этапе «${stage}».`, {
			...errorDetails(error), elapsedMs: Date.now() - startedAt,
		});
		throw error;
	} finally {
		connection.dispose();
		logger?.info('TCP-соединение закрыто.', { elapsedMs: Date.now() - startedAt });
	}
}

async function exchangeLogged(connection: OenpConnection, request: Buffer, stage: string, logger?: ProductionTasksLogger, includeResponseHead = true): Promise<Buffer> {
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
			throw new Error(readOenpError(response) || `Сервер OENP вернул исключение на этапе «${stage}».`);
		}
		return response;
	} catch (error) {
		logger?.error(`OENP: обмен завершился ошибкой на этапе «${stage}».`, { requestId, ...errorDetails(error), elapsedMs: Date.now() - startedAt });
		throw error;
	}
}

function errorDetails(error: unknown): { name?: string; message: string; code?: string; stack?: string } {
	if (!(error instanceof Error)) { return { message: String(error) }; }
	const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
	return { name: error.name, message: error.message, code, stack: error.stack };
}

type AuthHashMode = { encoding: 'win1251' | 'utf8' | 'utf16le'; usernameCase: 'lower' | 'upper' | 'original' };

export function createLoginParameters(options: ProductionConnectionOptions, challenge: string, mode: AuthHashMode = { encoding: 'win1251', usernameCase: 'lower' }, username = options.username): string {
	const { modern, legacy } = deriveAuthorizationHashes(username, options.password, challenge, mode);
	const windowsVersion = `Windows (${os.release()}, ${process.arch === 'x64' ? '64' : '32'}-bit Edition)`;
	return `host=oesrv,host=${options.host},UpdateUrl=${options.host},DB=${options.database},UserName=${username},Password=${modern},ApplicationName=FME.exe,LogoutOtherSessions=0,OldPassword=${legacy},"ClientOSVersion=${windowsVersion}",ClientTimeZone=Europe/Moscow`;
}

function inspectAuthorizationCompatibility(options: ProductionConnectionOptions): { mode?: AuthHashMode; username?: string; diagnostics: Record<string, unknown> } | undefined {
	const reference = options.authorizationReference;
	if (!reference) { return undefined; }
	const modes: AuthHashMode[] = [
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

function deriveAuthorizationHashes(username: string, password: string, challenge: string, mode: AuthHashMode): { modern: string; legacy: string } {
	const normalizedUsername = mode.usernameCase === 'lower'
		? username.toLocaleLowerCase('ru-RU')
		: mode.usernameCase === 'upper' ? username.toLocaleUpperCase('ru-RU') : username;
	const hash = (value: string) => createHash('md5').update(iconv.encode(value, mode.encoding)).digest('hex').toUpperCase();
	const privatePassword = hash(`${normalizedUsername}:${password}`);
	const oldPrivatePassword = hash(password).slice(0, 30);
	return {
		modern: hash(`${challenge}${privatePassword}`),
		legacy: hash(`${challenge}${normalizedUsername}:${oldPrivatePassword}`),
	};
}
function text(value: number | string | null | undefined): string { return value === null || value === undefined ? '' : String(value); }

class OenpConnection {
	private socket?: net.Socket;
	private pending = Buffer.alloc(0);
	constructor(private readonly host: string, private readonly port: number) {}
	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection({ host: this.host, port: this.port });
			this.socket = socket;
			socket.setTimeout(15_000);
			socket.once('connect', resolve);
			socket.once('error', reject);
			socket.once('timeout', () => reject(new Error(`Тайм-аут подключения к ${this.host}:${this.port}.`)));
		});
	}
	exchange(request: Buffer): Promise<Buffer> {
		const socket = this.socket;
		if (!socket) { return Promise.reject(new Error('Соединение OENP не открыто.')); }
		return new Promise((resolve, reject) => {
			let required = 0;
			const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('timeout', onTimeout); };
			const onError = (error: Error) => { cleanup(); reject(error); };
			const onTimeout = () => onError(new Error('Сервер Восточного Экспресса не ответил вовремя.'));
			const onData = (chunk: Buffer) => {
				this.pending = Buffer.concat([this.pending, chunk]);
				if (!required && this.pending.length >= 8) { required = expectedPacketLength(this.pending); }
				if (required && this.pending.length >= required) {
					const response = this.pending.subarray(0, required);
					this.pending = this.pending.subarray(required);
					cleanup(); resolve(response);
				}
			};
			socket.on('data', onData); socket.once('error', onError); socket.once('timeout', onTimeout);
			socket.write(request);
		});
	}
	dispose(): void { this.socket?.destroy(); this.socket = undefined; }
}
