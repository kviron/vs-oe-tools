import * as vscode from 'vscode';
import { searchDatabaseObjects } from '../../infrastructure/database/objectSearchRepository';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import type { ProductionTaskSummary, ProductionTasksLogger } from './models';
import { openProductionTaskDetails } from './productionTaskDetailsPanel';
import { loadProductionTaskActions, loadProductionTaskAttachments, loadProductionTaskHistory, loadProductionTaskReference, loadProductionTaskRichDescription, loadProductionTasksByQuery } from './productionTasksRepository';
import { ProductionTasksPanelManager, registerProductionTasksActivityLauncher } from './productionTasksViewProvider';
import { createProductionSession } from './session';
import { createProductionAgentActions } from './agent';

export interface ProductionTasksRegistration {
	agentActions: ReturnType<typeof createProductionAgentActions>;
	showTask(task: ProductionTaskSummary): void;
	searchTasks(query: string, limit: number): Promise<ProductionTaskSummary[]>;
	openReference(reference: number): Promise<void>;
}

export function registerProductionTasks(
	context: vscode.ExtensionContext,
	workspacePath: string | undefined,
	getCredentials: () => Promise<{ username: string; password: string | undefined }>,
	extensionLogger: ExtensionLogService,
): ProductionTasksRegistration {
	const logger: ProductionTasksLogger = {
		info: (message, details) => extensionLogger.info('Production Tasks', message, details),
		warning: (message, details) => extensionLogger.warning('Production Tasks', message, details),
		error: (message, details) => extensionLogger.error('Production Tasks', message, details),
	};
	const session = createProductionSession(context, workspacePath, getCredentials, logger);
	const findDatabaseObjectById = async (id: number) => (await searchDatabaseObjects(String(id), 1))[0];
	const showTask = (task: ProductionTaskSummary): void => openProductionTaskDetails(
		context,
		task,
		findDatabaseObjectById,
		async reference => loadProductionTaskReference(await session.getOptions(), reference, logger),
		showTask,
		async () => loadProductionTaskActions(await session.getOptions(), task.id, logger),
		async () => loadProductionTaskAttachments(await session.getOptions(), task.id, logger),
		async () => loadProductionTaskHistory(await session.getOptions(), task.id, logger),
		async () => loadProductionTaskRichDescription(await session.getOptions(), task.id, logger),
	);
	const provider = new ProductionTasksPanelManager(
		context.extensionUri,
		session.getOptions,
		showTask,
		session.importCapture,
		session.setPassword,
		logger,
		() => extensionLogger.show(),
	);
	context.subscriptions.push(
		provider,
		vscode.commands.registerCommand('vc-ve-tools.openProductionTasks', () => provider.show()),
		registerProductionTasksActivityLauncher(provider),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('vcVeTools.productionHost') || event.affectsConfiguration('vcVeTools.productionPort')
				|| event.affectsConfiguration('vcVeTools.productionDatabase') || event.affectsConfiguration('vcVeTools.productionClientSessionKey')
				|| event.affectsConfiguration('vcVeTools.productionPersonId')
				|| event.affectsConfiguration('vcVeTools.clientUsername')) {
				void provider.refresh();
			}
		}),
	);
	return {
		agentActions: createProductionAgentActions(session.getOptions, logger),
		showTask,
		searchTasks: async (query, limit) => loadProductionTasksByQuery(await session.getOptions(), query, limit, logger),
		openReference: async reference => {
			const task = await loadProductionTaskReference(await session.getOptions(), reference, logger);
			if (task) { showTask(task); return; }
			void vscode.window.showInformationMessage(`Задача ${reference} не найдена.`);
		},
	};
}
