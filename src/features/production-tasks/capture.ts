import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractCapturedAuthorization, extractCurrentPersonId } from './oenpProtocol';
import type { CapturedAuthorization } from './models';

export async function findCaptureMetadata(directories: string[]): Promise<{ personId?: number; authorization?: CapturedAuthorization }> {
	let personId: number | undefined;
	let authorization: CapturedAuthorization | undefined;
	for (const directoryPath of new Set(directories.map(directory => path.resolve(directory)))) {
		try {
			const directory = vscode.Uri.file(directoryPath);
			for (const [name, fileType] of await vscode.workspace.fs.readDirectory(directory)) {
				if (fileType !== vscode.FileType.File || !name.toLowerCase().endsWith('.pcapng')) { continue; }
				const capture = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, name)));
				personId ??= extractCurrentPersonId(capture);
				authorization ??= extractCapturedAuthorization(capture);
				if (personId && authorization) { return { personId, authorization }; }
			}
		} catch { /* The explicit import action reports capture read failures. */ }
	}
	return { personId, authorization };
}

export function parseStoredAuthorization(value: string | undefined): CapturedAuthorization | undefined {
	if (!value) { return undefined; }
	try {
		const parsed = JSON.parse(value) as Partial<CapturedAuthorization>;
		if (typeof parsed.username === 'string' && /^[A-F\d]{32}$/i.test(parsed.challenge ?? '')
			&& /^[A-F\d]{32}$/i.test(parsed.passwordHash ?? '') && /^[A-F\d]{32}$/i.test(parsed.oldPasswordHash ?? '')) {
			return parsed as CapturedAuthorization;
		}
	} catch { /* Ignore a stale or damaged SecretStorage entry. */ }
	return undefined;
}
