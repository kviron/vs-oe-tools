import { createHash } from 'node:crypto';
import * as os from 'node:os';
import iconv from 'iconv-lite';
import type { ProductionConnectionOptions } from './models';

type AuthHashMode = { encoding: 'win1251' | 'utf8' | 'utf16le'; usernameCase: 'lower' | 'upper' | 'original' };

export function createLoginParameters(options: ProductionConnectionOptions, challenge: string, mode: AuthHashMode = { encoding: 'win1251', usernameCase: 'lower' }, username = options.username): string {
	const { modern, legacy } = deriveAuthorizationHashes(username, options.password, challenge, mode);
	const windowsVersion = `Windows (${os.release()}, ${process.arch === 'x64' ? '64' : '32'}-bit Edition)`;
	return `host=oesrv,host=${options.host},UpdateUrl=${options.host},DB=${options.database},UserName=${username},Password=${modern},ApplicationName=FME.exe,LogoutOtherSessions=0,OldPassword=${legacy},"ClientOSVersion=${windowsVersion}",ClientTimeZone=Europe/Moscow`;
}

export function inspectAuthorizationCompatibility(options: ProductionConnectionOptions): { mode?: AuthHashMode; username?: string; diagnostics: Record<string, unknown> } | undefined {
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
