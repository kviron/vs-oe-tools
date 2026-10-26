import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ClientMcpConnectionError, getClientMcpHealth, getClientMcpUrl, type ClientMcpHealth } from './http';

const execFileAsync = promisify(execFile);
export interface GuiClient { processId: number; database: string; host: string }
export interface GuiCommandAdapters {
	listClients(): Promise<GuiClient[]>;
	openUri(uri: string): Promise<void>;
}

export function createClientCommandUri(database: string, command: string): string {
	if (!/^[a-z0-9_-]+$/iu.test(database)) { throw new Error('Некорректное имя базы клиента.'); }
	if (!/^[a-z][a-z0-9._-]{0,99}$/u.test(command)) { throw new Error('Некорректное имя команды клиента.'); }
	return `oe-${database.toLowerCase()}:/command/${command}`;
}

async function listClients(): Promise<GuiClient[]> {
	// Return only identity fields, never command lines containing passwords.
	const script = '$items = @(Get-CimInstance Win32_Process -Filter "Name = \'FME.exe\'" | ForEach-Object { '
		+ '$line = $_.CommandLine; if ($line -match \'(?i)(?:^|[,\\s"])db=([^,\\s"]+)\') { $db = $Matches[1]; '
		+ 'if ($line -match \'(?i)(?:^|[,\\s"])host=([^,\\s"]+)\') { '
		+ '[PSCustomObject]@{processId=$_.ProcessId;database=$db;host=$Matches[1]} } } }); '
		+ 'ConvertTo-Json -InputObject $items -Compress';
	const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
		{ windowsHide: true, timeout: 5000 });
	const result: unknown = JSON.parse(stdout.trim());
	if (!Array.isArray(result)) { throw new Error('Не удалось определить открытые клиенты FME.'); }
	return result.filter((item): item is GuiClient => Number.isSafeInteger(item?.processId) && item.processId > 0
		&& typeof item.database === 'string' && typeof item.host === 'string');
}

async function openUri(uri: string): Promise<void> {
	await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
		`Start-Process -FilePath '${uri}' -WindowStyle Hidden`], { windowsHide: true, timeout: 5000 });
}

/** Dispatches one registered command to an existing, unambiguous client. Acceptance is not execution proof. */
export async function dispatchClientCommand(database: string, host: string, command: string,
	adapters: GuiCommandAdapters = { listClients, openUri }): Promise<GuiClient & { uri: string }> {
	const uri = createClientCommandUri(database, command);
	const clients = (await adapters.listClients()).filter(client => client.database.toLowerCase() === database.toLowerCase()
		&& client.host.toLowerCase() === host.toLowerCase());
	if (clients.length !== 1) { throw new Error(`Для ${host}/${database} нужен ровно один открытый FME; найдено ${clients.length}.`); }
	await adapters.openUri(uri);
	return { ...clients[0], uri };
}

export function verifyGuiHealth(health: ClientMcpHealth, client: GuiClient): void {
	if (health.status.toLowerCase() !== 'ok' || health.database?.toLowerCase() !== client.database.toLowerCase()
		|| health.isConsole !== false || health.processId !== client.processId) {
		throw new Error('MCP отвечает из другого процесса или базы; подключение к открытому FME не подтверждено.');
	}
}

/** Starts the registered mcp.start command, then proves that the listener belongs to that FME. */
export async function startGuiClientMcp(database: string, host: string): Promise<GuiClient & { uri: string; url: string }> {
	try {
		const existing = await getClientMcpHealth();
		if (existing.isConsole !== false) { throw new Error('Адрес MCP занят консольным исполнителем; сначала завершите его вызов.'); }
	} catch (error) {
		if (!(error instanceof ClientMcpConnectionError) || !error.connectionRefused) { throw error; }
	}
	const client = await dispatchClientCommand(database, host, 'mcp.start');
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			verifyGuiHealth(await getClientMcpHealth(), client);
			return { ...client, url: getClientMcpUrl() };
		} catch (error) {
			if (!(error instanceof ClientMcpConnectionError) || !error.connectionRefused) { throw error; }
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
	throw new Error('Команда отправлена, но MCP открытого FME не подтвердил запуск. Повтор автоматически не выполнялся.');
}
