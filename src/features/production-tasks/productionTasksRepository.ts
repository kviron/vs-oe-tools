import { createHash } from 'node:crypto';
import * as net from 'node:net';
import * as os from 'node:os';
import iconv from 'iconv-lite';
import type { CapturedAuthorization, ProductionConnectionOptions, ProductionTaskAttachment, ProductionTasksLogger, ProductionTaskSummary } from './models';
import { createChallengePacket, createClientReadyPacket, createClientVersionPacket, createDatabaseProbePacket, createInitialPacket, createLoginPacket, createProtocolInitPacket, createReadonlyQueryPacket, expectedPacketLength, parseChallenge, parseMemoryDataPacket, readOenpError } from './oenpProtocol';

export const productionTaskSql = `SELECT T0.ID AS id,
  COALESCE(CAST(T0.DNumber AS VARCHAR(64)), '') AS number,
  COALESCE(CAST(SO1.FName AS VARCHAR(250)), '') AS state,
  COALESCE(CAST(left(T0.Description, 6000) AS VARCHAR(6000)), '') AS title,
  COALESCE(CAST(DateToStrFmt(T0.CreDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS created,
  COALESCE(CAST(DateToStrFmt(T0.Deadline, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS deadline,
  COALESCE((SELECT CAST(SA.FName AS VARCHAR(250)) FROM StructureActivity SA WHERE SA.ID = T0.KindActivity), '') AS activitykind,
  COALESCE((SELECT CAST(SO2.FName AS VARCHAR(250)) FROM TypeWork SO2 WHERE SO2.ID = T0.Tip), '') AS worktype,
  CAST(COALESCE((SELECT string_agg(CAST(PD.Description AS VARCHAR(6000)), ', ')
    FROM ProjectDoc PD
    WHERE commagetpos((SELECT R.Refs FROM GETREFOBJECTS(T0.ID, 8927966, 8927510) R), PD.ID) > -1), '') AS VARCHAR(6000)) AS project,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Initiator), '') AS author,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Manager), '') AS manager,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Analizer), '') AS analyst,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Executor), '') AS executor,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Controller), '') AS reviewer,
  COALESCE(CAST(T0.Mantis AS VARCHAR(1000)), '') AS appeal,
  COALESCE(CAST(T0.PackageOfWork AS VARCHAR(250)), '') AS packagename,
  CAST(COALESCE((SELECT string_agg(CAST(PN.Name AS VARCHAR(1000)), ', ')
    FROM PartNews PN
    WHERE commagetpos((SELECT R.Refs FROM GETREFOBJECTS(T0.ID, 10763223, 10160264) R), PN.ID) > -1), '') AS VARCHAR(6000)) AS newssection,
  COALESCE((SELECT CAST(E.Name AS VARCHAR(250)) FROM Enum E WHERE E.ID = T0.Priority), '') AS priority,
  COALESCE(CAST(T0.Intensity AS VARCHAR(64)), '') AS effort,
  COALESCE((SELECT CAST(R.ReleaseByDigits AS VARCHAR(64)) FROM URRelease R WHERE R.ID = T0.ReleasePlan), '') AS releaseplan,
  COALESCE((SELECT CAST(R.ReleaseByDigits AS VARCHAR(64)) FROM URRelease R WHERE R.ID = T0.ReleaseFact), '') AS releaseactual,
  COALESCE(CAST(T0.Revision_ReleaseBefore AS VARCHAR(64)), '') AS revisiontrunk,
  COALESCE(CAST(T0.Revision_ReleaseFact AS VARCHAR(64)), '') AS revisionbranch,
  COALESCE(CAST(left(T0.Comment, 6000) AS VARCHAR(6000)), '') AS workdescription,
  COALESCE((SELECT CAST(left(H.Comment, 6000) AS VARCHAR(6000)) FROM HistoryLC H WHERE H.ID = T0.LCLastActionID), '') AS statecomment,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000))
    FROM HistoryLC H JOIN Persons P ON P.ID = H.Person WHERE H.ID = T0.LCLastActionID), '') AS statecommentauthor
FROM WorkDoc T0
LEFT JOIN StateLC SO1 ON SO1.ID=T0.LCStateID
WHERE T0.LCStateID NOT IN (11822369, 8929693, 8929692, 8929694, 11821629)
  AND (T0.Initiator = %CurPerson OR T0.LCStateID <> 11821554)
  AND T0.RespPerson = %CurPerson
ORDER BY CASE WHEN T0.LCStateID IN (11821106, 820069919) THEN 0 ELSE 1 END, T0.OrdPlan
LIMIT 250`;

export function productionTaskAttachmentsSql(taskId: number): string {
	if (!Number.isSafeInteger(taskId) || taskId <= 0) {
		throw new Error('ID задачи для загрузки вложений должен быть положительным целым числом.');
	}
	return `SELECT SF.ID AS id,
  COALESCE(CAST(SF.Name AS VARCHAR(1000)), '') AS name,
  COALESCE(CAST(SF.FileName AS VARCHAR(1000)), '') AS filename,
  COALESCE(CAST(SF.FileExtension AS VARCHAR(64)), '') AS fileextension,
  COALESCE(CAST(SF.FileSizeStr AS VARCHAR(64)), '') AS filesizestr,
  COALESCE(CAST(SF.FileSize AS VARCHAR(64)), '') AS filesize,
  COALESCE(CAST(DateToStrFmt(SF.ChangeDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS changed,
  COALESCE(CAST(left(SF.Comment, 2000) AS VARCHAR(2000)), '') AS comment
FROM StoredFiles SF
WHERE SF.SeniorID = ${taskId}
ORDER BY SF.Name, SF.ID
LIMIT 250`;
}

export async function loadProductionTaskAttachments(
	options: ProductionConnectionOptions,
	taskId: number,
	logger?: ProductionTasksLogger,
): Promise<ProductionTaskAttachment[]> {
	const connection = new OenpConnection(options.host, options.port);
	const startedAt = Date.now();
	let stage = 'подключение для загрузки вложений';
	logger?.info('Начата загрузка вложений задачи.', { taskId });
	try {
		await connection.connect();
		stage = 'регистрация клиентской сессии для вложений';
		await exchangeLogged(connection, createInitialPacket(options.clientSessionKey), stage, logger);
		stage = 'проверка версии клиента для вложений';
		await exchangeLogged(connection, createClientVersionPacket(2), stage, logger);
		stage = 'инициализация протокола для вложений';
		await exchangeLogged(connection, createProtocolInitPacket(3), stage, logger);
		stage = 'выбор базы для вложений';
		await exchangeLogged(connection, createDatabaseProbePacket(4), stage, logger);
		stage = 'готовность клиента для вложений';
		await exchangeLogged(connection, createClientReadyPacket(5), stage, logger);
		stage = 'получение challenge для вложений';
		const challenge = parseChallenge(await exchangeLogged(connection, createChallengePacket(6), stage, logger, false));
		const authCompatibility = inspectAuthorizationCompatibility(options);
		stage = 'авторизация для вложений';
		await exchangeLogged(connection, createLoginPacket(7, createLoginParameters(options, challenge, authCompatibility?.mode, authCompatibility?.username)), stage, logger, false);
		stage = 'запрос вложений задачи';
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskAttachmentsSql(taskId), options.personId), stage, logger);
		stage = 'разбор ответа со вложениями задачи';
		const attachments = parseMemoryDataPacket(response).map(row => ({
			id: Number(row.id) >>> 0,
			name: text(row.name),
			fileName: text(row.filename),
			extension: text(row.fileextension),
			size: text(row.filesizestr) || text(row.filesize),
			changedAt: normalizeProductionDate(text(row.changed)),
			comment: text(row.comment),
		}));
		logger?.info('Вложения задачи успешно загружены.', { taskId, count: attachments.length, elapsedMs: Date.now() - startedAt });
		return attachments;
	} catch (error) {
		logger?.error(`Ошибка на этапе «${stage}».`, { taskId, ...errorDetails(error), elapsedMs: Date.now() - startedAt });
		throw error;
	} finally {
		connection.dispose();
	}
}

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
			id: Number(row.id) >>> 0, number: text(row.number), state: text(row.state), title: text(row.title),
			createdAt: normalizeProductionDate(text(row.created)), deadline: normalizeProductionDate(text(row.deadline)),
			activityKind: text(row.activitykind), workType: text(row.worktype), project: text(row.project),
			author: text(row.author), manager: text(row.manager), analyst: text(row.analyst), executor: text(row.executor), reviewer: text(row.reviewer),
			appeal: text(row.appeal), packageName: text(row.packagename), newsSection: text(row.newssection), priority: text(row.priority), effort: text(row.effort),
			releasePlan: text(row.releaseplan), releaseActual: text(row.releaseactual), revisionTrunk: text(row.revisiontrunk), revisionBranch: text(row.revisionbranch),
			workDescription: text(row.workdescription), stateComment: text(row.statecomment), stateCommentAuthor: text(row.statecommentauthor),
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
export function normalizeProductionDate(value: string): string { return /^30\.12\.1899(?:\s+00:00(?::00)?)?$/.test(value.trim()) ? '' : value; }

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
