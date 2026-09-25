import type * as vscode from 'vscode';
import { openClassDetails, restoreClassDetailPanels } from '../features/classes';
import { registerMethodLanguageFeatures } from '../features/methods';
import { registerPackageSync } from '../features/package-sync';
import { registerSqlExecutor } from '../features/sql-executor';
import { registerNativeLogs } from '../features/native-logs';
import type { registerEditors } from './editors';
import type { registerFeatures } from './features';

export function registerWorkbench(
	context: vscode.ExtensionContext,
	editors: ReturnType<typeof registerEditors>,
	features: ReturnType<typeof registerFeatures>,
) {
	const packageSyncProvider = registerPackageSync(context);
	registerMethodLanguageFeatures(context, editors.methodEditor, async id => {
		await features.explorerProvider.revealClass(id);
		await openClassDetails(context, editors.methodEditor, id, true);
	});
	void restoreClassDetailPanels(context, editors.methodEditor).catch(error => {
		console.error('Не удалось восстановить панели классов:', error);
	});
	registerSqlExecutor(context);
	registerNativeLogs(context);
	return { packageSyncProvider };
}
