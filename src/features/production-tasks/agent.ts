import type { ProductionTasksLogger } from './models';
import { loadProductionTaskHistory, loadProductionTasks, loadProductionTasksByQuery } from './productionTasksRepository';
import { listMcpTasks } from './productionMcpRepository';
import type { ProductionSession } from './session';

export function createProductionAgentActions(getOptions: ProductionSession['getOptions'], logger: ProductionTasksLogger) {
	return {
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
			const tasks = await loadProductionTasks(options, logger);
			const normalizedQuery = query?.trim().toLocaleLowerCase('ru-RU');
			const filtered = normalizedQuery
				? tasks.filter(task => [task.id, task.number, task.title]
					.some(value => String(value).toLocaleLowerCase('ru-RU').includes(normalizedQuery)))
				: tasks;
			return {
				database: options.database,
				personId: options.personId,
				query: query ?? null,
				totalCount: filtered.length,
				count: Math.min(filtered.length, limit),
				truncated: filtered.length > limit,
				tasks: filtered.slice(0, limit).map(task => ({
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
