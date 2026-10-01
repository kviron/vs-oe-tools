import { ClientMcpConnectionError, ClientMcpHttpError, getClientMcpHealth, getClientMcpUrl, stopClientMcpServer, type ClientMcpHealth } from './http';

/** Checks readiness before dispatch; recovers a lost native session without retrying tool calls. */
export async function prepareClientMcpStart(url = getClientMcpUrl()): Promise<ClientMcpHealth | undefined> {
	try {
		const health = await getClientMcpHealth(url);
		if (health.status.toLowerCase() !== 'ok') { throw new Error(`Клиентский MCP ответил со статусом ${health.status}.`); }
		return health;
	} catch (error) {
		if (error instanceof ClientMcpConnectionError && error.connectionRefused) { return undefined; }
		if (!(error instanceof ClientMcpHttpError) || error.status !== 500
			|| !/neNoSessionKeyOrReconnectUIError|\(10054\)/u.test(error.body)) { throw error; }
		await stopClientMcpServer(url);
		await waitForClientMcpStop(url);
		return undefined;
	}
}

/** HTTP errors still mean the old listener owns the URL; only refusal confirms shutdown. */
export async function waitForClientMcpStop(url = getClientMcpUrl()): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt++) {
		try { await getClientMcpHealth(url); }
		catch (error) {
			if (error instanceof ClientMcpConnectionError && error.connectionRefused) { return; }
		}
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	throw new Error('Старый клиентский MCP не освободил HTTP адрес. Новый экземпляр не запущен.');
}
