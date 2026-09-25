import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Disposable } from 'vscode';
import type { NavigationActions } from './navigationTools';
import { createNavigationHandler } from './navigationHttp';

export interface NavigationBridge extends Disposable {
	readonly url: string;
	readonly token: string;
	readonly infoPath: string;
}

export async function startNavigationBridge(actions: NavigationActions, infoPath: string): Promise<NavigationBridge> {
	const token = randomBytes(32).toString('hex');
	const server = createServer(createNavigationHandler(token, actions));
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	const address = server.address() as AddressInfo;
	const url = `http://127.0.0.1:${address.port}/navigate`;
	await mkdir(dirname(infoPath), { recursive: true });
	await writeFile(infoPath, JSON.stringify({ url, token }), { encoding: 'utf8', mode: 0o600 });
	const removeInfoOnExit = () => {
		try {
			const current = JSON.parse(readFileSync(infoPath, 'utf8')) as { token?: string };
			if (current.token === token) { unlinkSync(infoPath); }
		} catch { /* The file may already be gone or belong to another extension host. */ }
	};
	process.once('exit', removeInfoOnExit);
	return {
		url,
		token,
		infoPath,
		dispose: () => {
			process.off('exit', removeInfoOnExit);
			server.close();
			void removeOwnInfoFile(infoPath, token);
		},
	};
}

async function removeOwnInfoFile(infoPath: string, token: string): Promise<void> {
	try {
		const current = JSON.parse(await readFile(infoPath, 'utf8')) as { token?: string };
		if (current.token === token) {
			await unlink(infoPath);
		}
	} catch {
		// The file may already be gone or replaced by a newer extension host.
	}
}
