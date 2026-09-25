import * as vscode from 'vscode';
import type { NavigationActions } from './navigationTools';
import { createClassAgentActions } from '../classes';
import { createMethodAgentActions, type MethodEditorProvider, type MethodCompilationService, type MethodCompilationHistory } from '../methods';
import { createModuleAgentActions, type ModuleEditorProvider } from '../modules';
import { createPackageSyncAgentActions } from '../package-sync';
import { createLifecycleAgentActions } from '../lifecycle';
import { createCodeHistoryAgentActions } from '../code-history';
import { createProjectAgentActions } from '../project';
import { createHttpTestAgentActions, type SettingsViewProvider } from '../settings';
import type { ExplorerViewProvider } from '../explorer';
import type { ProductionTasksRegistration } from '../production-tasks';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';

interface Dependencies {
	context: vscode.ExtensionContext;
	workspacePath: string | undefined;
	getClientCredentials(): Promise<{ username: string; password: string | undefined }>;
	extensionLogger: ExtensionLogService;
	explorerProvider: ExplorerViewProvider;
	methodEditor: MethodEditorProvider;
	methodCompilation: MethodCompilationService;
	compilationHistory: MethodCompilationHistory;
	moduleEditor: ModuleEditorProvider;
	settingsProvider: SettingsViewProvider;
	productionTasks: ProductionTasksRegistration;
}

export function createNavigationActions(dependencies: Dependencies): NavigationActions {
	const { context, workspacePath, getClientCredentials, extensionLogger, explorerProvider, methodEditor,
		methodCompilation, compilationHistory, moduleEditor, settingsProvider, productionTasks } = dependencies;
	return {
		confirmSqlMutation: async (sql, database) => {
			const choice = await vscode.window.showWarningMessage(
				`Выполнить изменяющий SQL-запрос в базе ${database}?`,
				{ modal: true, detail: sql },
				'Выполнить SQL',
			);
			return choice === 'Выполнить SQL';
		},
		...createClassAgentActions(context, methodEditor, id => explorerProvider.revealClass(id)),
		...createMethodAgentActions(methodEditor, methodCompilation, compilationHistory),
		...createModuleAgentActions(moduleEditor),
		...createPackageSyncAgentActions(),
		...createLifecycleAgentActions(workspacePath, getClientCredentials, extensionLogger),
		...createCodeHistoryAgentActions(),
		...createProjectAgentActions(getClientCredentials),
		...createHttpTestAgentActions(settingsProvider),
		...productionTasks.agentActions,
	};
}
