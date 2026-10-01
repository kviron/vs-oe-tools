import * as vscode from 'vscode';
import { parseClientLaunchArguments, startProjectClient } from './clientLaunchService';
import { openProjectClientEntity } from './clientNavigationService';
import { updateProjectDatabase } from './databaseUpdate';
import { updateProjectPackages } from './packageUpdateService';
import { updateProjectBinaries } from './binaryUpdate';
import { createProjectEncodingController } from './projectEncodingController';
import { registerProjectStatusBar } from './projectStatusBar';
import type { createClientCredentials } from './credentials';
import type { DatabaseRole } from '../../core/database';

interface Dependencies {
	context: vscode.ExtensionContext;
	credentials: ReturnType<typeof createClientCredentials>;
}

/** Registers project commands and owns their shared actions and encoding lifecycle. */
export function registerProject({ context, credentials }: Dependencies) {
	const encoding = createProjectEncodingController(context);
	const actions = {
		setProjectRootEnabled: encoding.setEnabled,
		validateClientLaunchArguments: parseClientLaunchArguments,
		updateDatabase: updateProjectDatabase,
		startClient: async (role: DatabaseRole) => startProjectClient(role, await credentials.get()),
		updatePackages: updateProjectPackages,
		updateBinaries: updateProjectBinaries,
	};
	context.subscriptions.push(
		vscode.commands.registerCommand('vc-ve-tools.updateMainDatabase', () => actions.updateDatabase('main')),
		vscode.commands.registerCommand('vc-ve-tools.updateTestDatabase', () => actions.updateDatabase('test')),
		vscode.commands.registerCommand('vc-ve-tools.startMainClient', () => actions.startClient('main')),
		vscode.commands.registerCommand('vc-ve-tools.startTestClient', () => actions.startClient('test')),
		registerProjectStatusBar(),
		vscode.commands.registerCommand('vc-ve-tools.openClientEntity',
			async (role: 'main' | 'test', entityType: string | undefined, id: number) => openProjectClientEntity(role, entityType, id)),
	);
	return { actions, onConfigurationChange: encoding.onConfigurationChange, initializeEncoding: encoding.initializeEncoding };
}
