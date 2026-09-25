import * as vscode from 'vscode';
import { clientUsernameSetting } from '../../core/constants';
import type { ClientCredentials } from './projectCommandService';

export function createClientCredentials(context: vscode.ExtensionContext, workspacePath: string | undefined) {
	const passwordKey = `vcVeTools.clientPassword:${workspacePath?.toLowerCase() ?? 'default'}`;
	return {
		get: async () => ({
			username: vscode.workspace.getConfiguration('vcVeTools').get<string>(clientUsernameSetting, ''),
			password: await context.secrets.get(passwordKey),
		}),
		set: async (credentials: ClientCredentials): Promise<void> => {
			await vscode.workspace.getConfiguration('vcVeTools').update(clientUsernameSetting, credentials.username ?? '', vscode.ConfigurationTarget.Workspace);
			if (credentials.password) { await context.secrets.store(passwordKey, credentials.password); }
		},
	};
}
