import {loadProductionTaskPage} from './productionOenpRepository';
import {taskPageSchema,type TaskPageInput} from './taskPage';
import type { ProductionTasksLogger } from './models';
import { loadProductionTaskHistory, loadProductionTasks, loadProductionTasksByQuery } from './productionTasksRepository';
import { listMcpTasks } from './productionMcpRepository';
import type { ProductionSession } from './session';

export function createProductionAgentActions(getOptions: ProductionSession['getOptions'], logger: ProductionTasksLogger) {
	return {
        getProductionTasksPage:async(input:TaskPageInput)=>{
            const parsed=taskPageSchema.parse(input),options=await getOptions();
            if('transport' in options){throw Error('Постраничный отбор по датам требует источника OENP в расширении. Публичный MCP не поддерживает этот контракт.');}
            const rows=await loadProductionTaskPage(options,parsed,logger),more=rows.length>parsed.limit,tasks=rows.slice(0,parsed.limit).map(t=>({id:t.id,number:t.number,title:t.title,createdAt:t.createdAt,state:t.state}));
            return {source:'oenp',database:options.database,count:tasks.length,tasks,has_more:more,next_after_id:more?tasks.at(-1)!.id:null,created_from:parsed.created_from??null,created_to:parsed.created_to??null};
        },
		getProductionTasks: async (query: string | undefined, limit: number, folderUri?: string) => {
			const options = await getOptions();
			logger.info('MCP запросил список production-задач.', { query: query ?? null, limit, hasFolderUri: Boolean(folderUri) });
			if ('transport' in options) {
				const tasks = query?.trim()
					? await loadProductionTasksByQuery(options, query, limit, logger, folderUri)
					: (await listMcpTasks(options, folderUri)).slice(0, limit);
				return { source: 'mcp', database: options.database, query: query ?? null, count: tasks.length, tasks,
					filterApplied: Boolean(folderUri),
					note: folderUri ? 'Список ограничен явно переданной папкой отбора. Статус и исполнитель доступны только если заданы условиями этой папки.' : 'Общая ограниченная выборка API. Статус и исполнитель доступны только через явно переданную папку отбора.' };
			}
			const filtered = await loadProductionTaskPage(options, { limit: Math.min(limit, 99) }, logger, query);
			return {
				database: options.database,
				personId: options.personId,
				query: query ?? null,
				totalCount: filtered.length > Math.min(limit,99) ? undefined : filtered.length,
				count: Math.min(filtered.length,limit,99),
				truncated: filtered.length > Math.min(limit,99),
				tasks: filtered.slice(0, Math.min(limit,99)).map(task => ({
					id: task.id, number: task.number, state: task.state, title: task.title,
					createdAt: task.createdAt, deadline: task.deadline, project: task.project, executor: task.executor,
				})),
			};
		},
		getProductionTask: async (query: string, limit: number) => {
			const options = await getOptions();
			logger.info('MCP запросил полную production-задачу.', { query, limit });
			const foundTasks = await loadProductionTasksByQuery(options, query, limit, logger);
			if ('transport' in options) {
				const mcpTasks = foundTasks.map(task => ({ ...task, history: [], historyAvailable: false }));
				return { source: 'mcp', database: options.database, query, count: foundTasks.length,
					match: mcpTasks.length === 1 ? mcpTasks[0] : null, tasks: mcpTasks,
					note: 'API возвращает номер, название, дату и текст. Остальные поля и история недоступны.' };
			}
			const tasks = [];
			for (const task of foundTasks) {
				const history = await loadProductionTaskHistory(options, task.id, logger);
				tasks.push({ ...task, history });
			}
			return {
				database: options.database,
				query,
				count: tasks.length,
				match: tasks.length === 1 ? tasks[0] : null,
				tasks,
			};
		},
		getProductionTasksInProgress: async (folderUri?: string) => {
			const options = await getOptions();
			logger.info('MCP запросил production-задачи в работе.');
			if ('transport' in options) {
				if (!folderUri) { throw new Error('Для списка задач в работе через публичный MCP передайте folder_uri папки отбора со статусом «В работе».'); }
				const tasks = await listMcpTasks(options, folderUri);
				return { source: 'mcp', database: options.database, count: tasks.length, tasks,
					note: 'Результат отфильтрован явно переданной папкой отбора; статус задаётся настройками этой папки.' };
			}
			const tasks = (await loadProductionTasks(options, logger))
				.filter(task => task.state.trim().toLocaleLowerCase('ru-RU') === 'в работе');
			return { database: options.database, personId: options.personId, count: tasks.length, tasks };
		},
	};
}
