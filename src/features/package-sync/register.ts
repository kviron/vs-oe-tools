import * as vscode from 'vscode';
import { loadPackageDatabaseVersion } from '../../infrastructure/database/packageSyncDiffRepository';
import { loadPackageSyncSnapshot } from '../../infrastructure/database/packageSyncRepository';
import { PackageSyncPanelManager } from './packageSyncViewProvider';
import { loadPackageSyncItemsFromMethod } from './packageSyncMethodSource';
import type { OeMethodCredentials } from '../lifecycle/oeStaticMethodExecutor';

export function registerPackageSync(
	context: vscode.ExtensionContext,
	workspacePath: string | undefined,
	getCredentials: () => Promise<OeMethodCredentials>,
): PackageSyncPanelManager {
	const provider = new PackageSyncPanelManager(context.extensionUri,
		() => loadPackageSyncSnapshot(() => loadPackageSyncItemsFromMethod(workspacePath, getCredentials)),
		loadPackageDatabaseVersion);
	context.subscriptions.push(
		provider,
		vscode.commands.registerCommand('vc-ve-tools.openPackageSync', () => provider.show()),
	);
	return provider;
}
