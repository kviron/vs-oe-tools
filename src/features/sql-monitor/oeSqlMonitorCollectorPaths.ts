import * as path from 'node:path';

export function getSqlMonitorCollectorCandidates(workspacePath: string, configuredPath: string): string[] {
	const candidates = [
		normalizeConfiguredPath(workspacePath, configuredPath),
		path.join(workspacePath, 'bin', 'OESQLMonCon.exe'),
		path.join(path.dirname(workspacePath), 'R306', 'bin', 'OESQLMonCon.exe'),
	].filter((candidate): candidate is string => Boolean(candidate));
	const seen = new Set<string>();
	return candidates.filter(candidate => {
		const key = candidate.toLowerCase();
		if (seen.has(key)) { return false; }
		seen.add(key);
		return true;
	});
}

function normalizeConfiguredPath(workspacePath: string, configuredPath: string): string | undefined {
	const value = configuredPath.trim();
	if (!value) { return undefined; }
	const resolved = path.resolve(workspacePath, value);
	return path.extname(resolved).toLowerCase() === '.exe' ? resolved : path.join(resolved, 'OESQLMonCon.exe');
}

export function isProtocolVersionMismatch(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /Неверная версия протокола данных|invalid data protocol version/i.test(message);
}
