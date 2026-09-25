import * as vscode from 'vscode';
import { loadPackageDatabaseVersion } from '../../infrastructure/database/packageSyncDiffRepository';
import { loadPackageSyncSnapshot } from '../../infrastructure/database/packageSyncRepository';
import { PackageSyncPanelManager } from './packageSyncViewProvider';

export function registerPackageSync(context: vscode.ExtensionContext): PackageSyncPanelManager {
	const provider = new PackageSyncPanelManager(context.extensionUri, loadPackageSyncSnapshot, loadPackageDatabaseVersion);
	context.subscriptions.push(
		provider,
		vscode.commands.registerCommand('vc-ve-tools.openPackageSync', () => provider.show()),
	);
	return provider;
}
