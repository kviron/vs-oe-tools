import type { ProductionConnectionOptions, ProductionTaskAction, ProductionTaskAttachment, ProductionTaskHistoryEntry, ProductionTaskListItem, ProductionTasksLogger, ProductionTaskSummary, ProductionTaskUser } from './models';
import { createReadonlyQueryPacket, parseMemoryDataPacket } from './oenpProtocol';
import { productionTaskActionsSql, productionTaskAttachmentsSql, productionTaskByIdSql, productionTaskHistorySql, productionTaskListSql, productionTaskReferenceSql, productionTaskRichDescriptionSql, productionTaskSearchSql, productionTaskSql, productionTaskUsersSql } from './queries';
import { exchangeLogged, errorDetails } from './connection';
import { withOenpSession } from './oenpSession';
import { mapProductionTask, normalizeProductionDate, text, positiveInteger } from './mapping';

const readonlyQueryTimeoutMs = 60_000;

export async function loadProductionTaskActions(
	options: ProductionConnectionOptions,
	taskId: number,
	logger?: ProductionTasksLogger,
): Promise<ProductionTaskAction[]> {
	const startedAt = Date.now();
	logger?.info('Начата загрузка действий задачи.', { taskId });
	return withOenpSession(options, 'действий задачи', logger, async connection => {
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskActionsSql(taskId), options.personId), 'запрос действий задачи', logger, true, readonlyQueryTimeoutMs);
		const actions = parseMemoryDataPacket(response).map(row => ({
			id: Number(row.id) >>> 0,
			name: text(row.name),
			verb: text(row.verb),
			targetState: text(row.targetstate),
			group: text(row.actiongroup),
			requiresComment: Number(row.requirescomment) !== 0,
			mandatoryComment: Number(row.mandatorycomment) !== 0,
			requiresCause: Number(row.requirescause) !== 0,
			requiresDate: Number(row.requiresdate) !== 0,
		}));
		logger?.info('Действия задачи успешно загружены.', { taskId, count: actions.length, elapsedMs: Date.now() - startedAt });
		return actions;
	});
}

export async function loadProductionTaskAttachments(
	options: ProductionConnectionOptions,
	taskId: number,
	logger?: ProductionTasksLogger,
): Promise<ProductionTaskAttachment[]> {
	const startedAt = Date.now();
	logger?.info('Начата загрузка вложений задачи.', { taskId });
	return withOenpSession(options, 'вложений задачи', logger, async connection => {
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskAttachmentsSql(taskId), options.personId), 'запрос вложений задачи', logger, true, readonlyQueryTimeoutMs);
		const attachments = parseMemoryDataPacket(response).map(row => ({
			id: Number(row.id) >>> 0,
			name: text(row.name),
			fileName: text(row.filename),
			extension: text(row.fileextension),
			size: text(row.filesizestr) || text(row.filesize),
			changedAt: normalizeProductionDate(text(row.changed)),
			comment: text(row.comment),
			storageFileId: text(row.storagefileid),
			storageType: text(row.storagetype),
			mainStoredFileId: positiveInteger(row.mainstoredfile),
			important: Number(row.important) !== 0,
		}));
		logger?.info('Вложения задачи успешно загружены.', { taskId, count: attachments.length, elapsedMs: Date.now() - startedAt });
		return attachments;
	});
}

export async function loadProductionTaskHistory(
	options: ProductionConnectionOptions,
	taskId: number,
	logger?: ProductionTasksLogger,
): Promise<ProductionTaskHistoryEntry[]> {
	const startedAt = Date.now();
	logger?.info('Начата загрузка истории задачи.', { taskId });
	return withOenpSession(options, 'истории задачи', logger, async connection => {
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskHistorySql(taskId), options.personId), 'запрос истории задачи', logger, true, readonlyQueryTimeoutMs);
		const history = parseMemoryDataPacket(response).map(row => ({
			id: Number(row.id) >>> 0,
			createdAt: normalizeProductionDate(text(row.created)),
			action: text(row.action),
			state: text(row.state),
			person: text(row.person),
			comment: text(row.comment),
		}));
		logger?.info('История задачи успешно загружена.', { taskId, count: history.length, elapsedMs: Date.now() - startedAt });
		return history;
	});
}

export async function loadProductionTasks(options: ProductionConnectionOptions, logger?: ProductionTasksLogger): Promise<ProductionTaskSummary[]> {
	return loadProductionTasksWithSql(options, productionTaskSql, 'списка задач', logger);
}

export async function loadProductionTaskList(
	options: ProductionConnectionOptions,
	userFilter: string | undefined,
	logger?: ProductionTasksLogger,
	onTasksLoaded?: (result: { tasks: ProductionTaskListItem[]; users: ProductionTaskUser[]; userFilter: string }) => Promise<void>,
): Promise<{ tasks: ProductionTaskListItem[]; users: ProductionTaskUser[]; userFilter: string }> {
	return withOenpSession(options, 'таблицы задач', logger, async connection => {
		let requestId = 8;
		const loadUsers = async () => {
			const response = await exchangeLogged(connection, createReadonlyQueryPacket(requestId++, productionTaskUsersSql, options.personId), 'список ответственных', logger, true, readonlyQueryTimeoutMs);
			return parseMemoryDataPacket(response).map(row => ({ id: Number(row.id), name: text(row.name) }));
		};
		// Older webviews saved a display name instead of a person ID.
		const legacyUserFilter = Boolean(userFilter && !/^\d+$/.test(userFilter));
		let users: ProductionTaskUser[] = legacyUserFilter ? await loadUsers() : [];
		const selectedUser = userFilter === undefined ? String(options.personId)
			: legacyUserFilter ? String(users.find(user => user.name === userFilter)?.id ?? options.personId) : userFilter;
		const sql = productionTaskListSql(selectedUser ? Number(selectedUser) : undefined);
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(requestId++, sql, options.personId), 'запрос строк таблицы задач', logger, true, readonlyQueryTimeoutMs);
		const tasks = parseMemoryDataPacket(response).map(row => {
			const task = mapProductionTask(row);
			return {
				id: task.id, number: task.number, state: task.state, title: task.title,
				createdAt: task.createdAt, deadline: task.deadline, workType: task.workType, project: task.project,
				executor: task.executor, responsibleUser: task.responsibleUser, responsibleUserId: task.responsibleUserId,
				appeal: task.appeal, packageName: task.packageName, priority: task.priority,
				releasePlan: task.releasePlan, attachmentCount: task.attachmentCount,
			};
		});
		logger?.info('Строки таблицы задач загружены.', { count: tasks.length, responsiblePersonId: selectedUser || null });
		if (!legacyUserFilter) {
			users = [...new Map(tasks.filter(task => task.responsibleUserId > 0).map(task => [task.responsibleUserId, { id: task.responsibleUserId, name: task.responsibleUser }])).values()];
		}
		await onTasksLoaded?.({ tasks, users, userFilter: selectedUser });
		if (!legacyUserFilter) {
			try { users = await loadUsers(); }
			catch (error) { logger?.warning('Не удалось догрузить список ответственных. Задачи уже загружены.', errorDetails(error)); }
		}
		return { tasks, users, userFilter: selectedUser };
	});
}

export async function loadProductionTaskById(options: ProductionConnectionOptions, id: number, logger?: ProductionTasksLogger): Promise<ProductionTaskSummary | undefined> {
	return (await loadProductionTasksWithSql(options, productionTaskByIdSql(id), 'карточки задачи', logger, { id }))[0];
}

export async function loadProductionTaskRichDescription(
	options: ProductionConnectionOptions,
	taskId: number,
	logger?: ProductionTasksLogger,
): Promise<string> {
	return withOenpSession(options, 'форматированного описания задачи', logger, async connection => {
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskRichDescriptionSql(taskId), options.personId), 'запрос форматированного описания задачи', logger, false, readonlyQueryTimeoutMs);
		const richDescription = text(parseMemoryDataPacket(response)[0]?.richdescription);
		logger?.info('Форматированное описание задачи загружено.', { taskId, length: richDescription.length });
		return richDescription;
	});
}

export async function loadProductionTasksByQuery(
	options: ProductionConnectionOptions,
	query: string,
	limit = 10,
	logger?: ProductionTasksLogger,
): Promise<ProductionTaskSummary[]> {
	return loadProductionTasksWithSql(options, productionTaskSearchSql(query, limit), 'поиска задач', logger, { query, limit });
}

async function loadProductionTasksWithSql(
	options: ProductionConnectionOptions,
	sql: string,
	requestLabel: string,
	logger?: ProductionTasksLogger,
	details?: Record<string, unknown>,
): Promise<ProductionTaskSummary[]> {
	return withOenpSession(options, requestLabel, logger, async connection => {
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, sql, options.personId), `запрос ${requestLabel}`, logger, true, readonlyQueryTimeoutMs);
		const tasks = parseMemoryDataPacket(response).map(mapProductionTask);
		logger?.info(`Загрузка ${requestLabel} завершена.`, { count: tasks.length, ...details });
		return tasks;
	});
}

export async function loadProductionTaskReference(
	options: ProductionConnectionOptions,
	reference: number,
	logger?: ProductionTasksLogger,
): Promise<ProductionTaskSummary | undefined> {
	const startedAt = Date.now();
	logger?.info('Начата загрузка связанной задачи.', { reference });
	return withOenpSession(options, 'связанной задачи', logger, async connection => {
		const response = await exchangeLogged(connection, createReadonlyQueryPacket(8, productionTaskReferenceSql(reference), options.personId), 'запрос связанной задачи', logger, true, readonlyQueryTimeoutMs);
		const task = parseMemoryDataPacket(response)[0];
		logger?.info('Связанная задача загружена.', { reference, found: Boolean(task), elapsedMs: Date.now() - startedAt });
		return task ? mapProductionTask(task) : undefined;
	});
}
