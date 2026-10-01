import * as vscode from 'vscode';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import type { ClientCredentials } from '../project';
import type { SettingsProjectActions } from './contracts';
import { SettingsViewProvider } from './settingsViewProvider';
import { ClientMcpService } from './clientMcpService';
import { HttpApiService } from './httpApiService';

interface Dependencies {
	context: vscode.ExtensionContext;
	logger: ExtensionLogService;
	project: SettingsProjectActions;
	credentials: {
		get(): Promise<ClientCredentials>;
		set(credentials: ClientCredentials): Promise<void>;
	};
}

/** Creates the settings UI and its services, and registers its commands and disposal. */
export function registerSettings({ context, logger, project, credentials }: Dependencies): SettingsViewProvider {
	const provider = new SettingsViewProvider(context.extensionUri, project, {
		clientMcp: new ClientMcpService(credentials.get, logger, context.workspaceState),
		httpApi: new HttpApiService(credentials.get),
	}, logger, credentials.get, credentials.set);
	context.subscriptions.push(
		provider,
		vscode.commands.registerCommand('vc-ve-tools.openSettings', () => provider.show()),
		vscode.commands.registerCommand('vc-ve-tools.openHttpApi', () => provider.showHttpApi()),
	);
	return provider;
}
