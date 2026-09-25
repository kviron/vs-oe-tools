import type { ProductionConnectionOptions, ProductionTasksLogger } from './models';
import { createChallengePacket, createClientReadyPacket, createClientVersionPacket, createDatabaseProbePacket, createInitialPacket, createLoginPacket, createProtocolInitPacket, parseChallenge } from './oenpProtocol';
import { createLoginParameters, inspectAuthorizationCompatibility } from './auth';
import { OenpConnection, exchangeLogged, errorDetails } from './connection';

export async function withOenpSession<T>(
	options: ProductionConnectionOptions,
	requestLabel: string,
	logger: ProductionTasksLogger | undefined,
	run: (connection: OenpConnection) => Promise<T>,
): Promise<T> {
	const connection = new OenpConnection(options.host, options.port);
	const startedAt = Date.now();
	let stage = 'подключение';
	logger?.info(`Начата загрузка ${requestLabel}.`, {
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
		stage = `запрос ${requestLabel}`;
		return await run(connection);
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
