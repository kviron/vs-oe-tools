import { execFile } from 'node:child_process';
import { Socket } from 'node:net';
import { promisify } from 'node:util';
import type { DatabaseRole } from '../../core/database';
import { resolveClientTarget } from './clientTarget';

const execFileAsync = promisify(execFile);

export interface ClientStatus {
	role: DatabaseRole;
	database: string;
	clientProcessDetected: boolean | null;
	serverPort: number | null;
	serverReachable: boolean | null;
}

async function processDatabases(): Promise<string[] | null> {
	// Only database names leave PowerShell. Process command lines can contain passwords.
	const script = '$items = @(Get-CimInstance Win32_Process -Filter "Name = \'FME.exe\'" | ForEach-Object { '
		+ 'if ($_.CommandLine -match \'(?i)(?:^|,)db=([^,\\s"]+)\') { $Matches[1] } }); '
		+ 'ConvertTo-Json -InputObject $items -Compress';
	try {
		const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
			{ windowsHide: true, timeout: 5000 });
		const result: unknown = JSON.parse(stdout.trim());
		return Array.isArray(result) ? result.filter((value): value is string => typeof value === 'string') : null;
	} catch { return null; }
}

function canConnect(port: number): Promise<boolean> {
	return new Promise(resolve => {
		const socket = new Socket();
		let settled = false;
		const finish = (connected: boolean): void => {
			if (settled) { return; }
			settled = true;
			socket.destroy();
			resolve(connected);
		};
		socket.setTimeout(1500, () => finish(false));
		socket.once('error', () => finish(false));
		socket.connect(port, '127.0.0.1', () => finish(true));
	});
}

export async function getProjectClientStatus(role: DatabaseRole): Promise<ClientStatus> {
	const target = await resolveClientTarget(role);
	const [databases, serverReachable] = await Promise.all([
		processDatabases(),
		target.serverPort === undefined ? Promise.resolve(null) : canConnect(target.serverPort),
	]);
	return {
		role,
		database: target.database,
		clientProcessDetected: databases?.some(database => database.toLowerCase() === target.database.toLowerCase()) ?? null,
		serverPort: target.serverPort ?? null,
		serverReachable,
	};
}
