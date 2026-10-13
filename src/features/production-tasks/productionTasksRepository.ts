import type { ProductionReadOptions, ProductionTasksLogger, ProductionTaskListItem, ProductionTaskUser } from './models';
import * as oenp from './productionOenpRepository';
import { listMcpTasks, readMcpTask, searchMcpTasks } from './productionMcpRepository';

/** Routes reads to the selected backend and reports unsupported public-MCP capabilities. */
function isMcp(options: ProductionReadOptions): options is Extract<ProductionReadOptions, { transport: 'mcp' }> {
	return 'transport' in options && options.transport === 'mcp';
}
function unavailable(feature: string): never { throw new Error('Публичный MCP пока не предоставляет ' + feature + '. Для этих данных переключите источник задач на OENP.'); }
export async function loadProductionTasks(options: ProductionReadOptions, logger?: ProductionTasksLogger) {
	return isMcp(options) ? listMcpTasks(options) : oenp.loadProductionTasks(options, logger);
}
export async function loadProductionTaskList(options: ProductionReadOptions, userFilter: string | undefined, logger?: ProductionTasksLogger,
	onTasksLoaded?: (result: { tasks: ProductionTaskListItem[]; users: ProductionTaskUser[]; userFilter: string }) => Promise<void>) {
	if (!isMcp(options)) { return oenp.loadProductionTaskList(options, userFilter, logger, onTasksLoaded); }
	const result = { tasks: await listMcpTasks(options), users: [], userFilter: '' };
	await onTasksLoaded?.(result);
	return result;
}
export async function loadProductionTaskById(options: ProductionReadOptions, id: number, logger?: ProductionTasksLogger) {
	return isMcp(options) ? readMcpTask(options, id) : oenp.loadProductionTaskById(options, id, logger);
}
export async function loadProductionTasksByQuery(options: ProductionReadOptions, query: string, limit = 10, logger?: ProductionTasksLogger, folderUri?: string) {
	return isMcp(options) ? searchMcpTasks(options, query, limit, folderUri) : oenp.loadProductionTasksByQuery(options, query, limit, logger);
}
export async function loadProductionTaskReference(options: ProductionReadOptions, reference: number, logger?: ProductionTasksLogger) {
	return isMcp(options) ? (await searchMcpTasks(options, String(reference), 1))[0] : oenp.loadProductionTaskReference(options, reference, logger);
}
export async function loadProductionTaskRichDescription(options: ProductionReadOptions, id: number, logger?: ProductionTasksLogger) {
	return isMcp(options) ? unavailable('форматированное описание') : oenp.loadProductionTaskRichDescription(options, id, logger);
}
export async function loadProductionTaskHistory(options: ProductionReadOptions, id: number, logger?: ProductionTasksLogger) {
	return isMcp(options) ? unavailable('историю задачи') : oenp.loadProductionTaskHistory(options, id, logger);
}
export async function loadProductionTaskAttachments(options: ProductionReadOptions, id: number, logger?: ProductionTasksLogger) {
	return isMcp(options) ? unavailable('вложения задачи') : oenp.loadProductionTaskAttachments(options, id, logger);
}
export async function loadProductionTaskActions(options: ProductionReadOptions, id: number, logger?: ProductionTasksLogger) {
	return isMcp(options) ? unavailable('действия задачи') : oenp.loadProductionTaskActions(options, id, logger);
}
