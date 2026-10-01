import * as vscode from 'vscode';
import type { DatabaseRole } from '../../core/database';
import { createClientObjectUri } from './clientDeepLink';
import { resolveClientTarget } from './clientTarget';

export async function openProjectClientEntity(
	role: DatabaseRole,
	// Kept for the existing command and agent contracts; edit/<ID> resolves the object in the client.
	_entityType: string | undefined,
	id: number,
): Promise<string> {
	const { database } = await resolveClientTarget(role);
	const uri = createClientObjectUri(database, id);
	const accepted = await vscode.env.openExternal(vscode.Uri.parse(uri));
	if (!accepted) { throw new Error(`Windows не приняла ссылку открытия объекта ВЭ: ${uri}`); }
	return uri;
}
