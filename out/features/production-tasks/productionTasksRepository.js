"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProductionTaskActions = loadProductionTaskActions;
exports.loadProductionTaskAttachments = loadProductionTaskAttachments;
exports.loadProductionTaskHistory = loadProductionTaskHistory;
exports.loadProductionTasks = loadProductionTasks;
exports.loadProductionTaskList = loadProductionTaskList;
exports.loadProductionTaskById = loadProductionTaskById;
exports.loadProductionTaskRichDescription = loadProductionTaskRichDescription;
exports.loadProductionTasksByQuery = loadProductionTasksByQuery;
exports.loadProductionTaskReference = loadProductionTaskReference;
const oenpProtocol_1 = require("./oenpProtocol");
const queries_1 = require("./queries");
const connection_1 = require("./connection");
const oenpSession_1 = require("./oenpSession");
const mapping_1 = require("./mapping");
const readonlyQueryTimeoutMs = 60_000;
async function loadProductionTaskActions(options, taskId, logger) {
    const startedAt = Date.now();
    logger?.info('Начата загрузка действий задачи.', { taskId });
    return (0, oenpSession_1.withOenpSession)(options, 'действий задачи', logger, async (connection) => {
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, (0, queries_1.productionTaskActionsSql)(taskId), options.personId), 'запрос действий задачи', logger, true, readonlyQueryTimeoutMs);
        const actions = (0, oenpProtocol_1.parseMemoryDataPacket)(response).map(row => ({
            id: Number(row.id) >>> 0,
            name: (0, mapping_1.text)(row.name),
            verb: (0, mapping_1.text)(row.verb),
            targetState: (0, mapping_1.text)(row.targetstate),
            group: (0, mapping_1.text)(row.actiongroup),
            requiresComment: Number(row.requirescomment) !== 0,
            mandatoryComment: Number(row.mandatorycomment) !== 0,
            requiresCause: Number(row.requirescause) !== 0,
            requiresDate: Number(row.requiresdate) !== 0,
        }));
        logger?.info('Действия задачи успешно загружены.', { taskId, count: actions.length, elapsedMs: Date.now() - startedAt });
        return actions;
    });
}
async function loadProductionTaskAttachments(options, taskId, logger) {
    const startedAt = Date.now();
    logger?.info('Начата загрузка вложений задачи.', { taskId });
    return (0, oenpSession_1.withOenpSession)(options, 'вложений задачи', logger, async (connection) => {
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, (0, queries_1.productionTaskAttachmentsSql)(taskId), options.personId), 'запрос вложений задачи', logger, true, readonlyQueryTimeoutMs);
        const attachments = (0, oenpProtocol_1.parseMemoryDataPacket)(response).map(row => ({
            id: Number(row.id) >>> 0,
            name: (0, mapping_1.text)(row.name),
            fileName: (0, mapping_1.text)(row.filename),
            extension: (0, mapping_1.text)(row.fileextension),
            size: (0, mapping_1.text)(row.filesizestr) || (0, mapping_1.text)(row.filesize),
            changedAt: (0, mapping_1.normalizeProductionDate)((0, mapping_1.text)(row.changed)),
            comment: (0, mapping_1.text)(row.comment),
            storageFileId: (0, mapping_1.text)(row.storagefileid),
            storageType: (0, mapping_1.text)(row.storagetype),
            mainStoredFileId: (0, mapping_1.positiveInteger)(row.mainstoredfile),
            important: Number(row.important) !== 0,
        }));
        logger?.info('Вложения задачи успешно загружены.', { taskId, count: attachments.length, elapsedMs: Date.now() - startedAt });
        return attachments;
    });
}
async function loadProductionTaskHistory(options, taskId, logger) {
    const startedAt = Date.now();
    logger?.info('Начата загрузка истории задачи.', { taskId });
    return (0, oenpSession_1.withOenpSession)(options, 'истории задачи', logger, async (connection) => {
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, (0, queries_1.productionTaskHistorySql)(taskId), options.personId), 'запрос истории задачи', logger, true, readonlyQueryTimeoutMs);
        const history = (0, oenpProtocol_1.parseMemoryDataPacket)(response).map(row => ({
            id: Number(row.id) >>> 0,
            createdAt: (0, mapping_1.normalizeProductionDate)((0, mapping_1.text)(row.created)),
            action: (0, mapping_1.text)(row.action),
            state: (0, mapping_1.text)(row.state),
            person: (0, mapping_1.text)(row.person),
            comment: (0, mapping_1.text)(row.comment),
        }));
        logger?.info('История задачи успешно загружена.', { taskId, count: history.length, elapsedMs: Date.now() - startedAt });
        return history;
    });
}
async function loadProductionTasks(options, logger) {
    return loadProductionTasksWithSql(options, queries_1.productionTaskSql, 'списка задач', logger);
}
async function loadProductionTaskList(options, userFilter, logger, onTasksLoaded) {
    return (0, oenpSession_1.withOenpSession)(options, 'таблицы задач', logger, async (connection) => {
        let requestId = 8;
        const loadUsers = async () => {
            const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(requestId++, queries_1.productionTaskUsersSql, options.personId), 'список ответственных', logger, true, readonlyQueryTimeoutMs);
            return (0, oenpProtocol_1.parseMemoryDataPacket)(response).map(row => ({ id: Number(row.id), name: (0, mapping_1.text)(row.name) }));
        };
        // Older webviews saved a display name instead of a person ID.
        const legacyUserFilter = Boolean(userFilter && !/^\d+$/.test(userFilter));
        let users = legacyUserFilter ? await loadUsers() : [];
        const selectedUser = userFilter === undefined ? String(options.personId)
            : legacyUserFilter ? String(users.find(user => user.name === userFilter)?.id ?? options.personId) : userFilter;
        const sql = (0, queries_1.productionTaskListSql)(selectedUser ? Number(selectedUser) : undefined);
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(requestId++, sql, options.personId), 'запрос строк таблицы задач', logger, true, readonlyQueryTimeoutMs);
        const tasks = (0, oenpProtocol_1.parseMemoryDataPacket)(response).map(row => {
            const task = (0, mapping_1.mapProductionTask)(row);
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
            try {
                users = await loadUsers();
            }
            catch (error) {
                logger?.warning('Не удалось догрузить список ответственных. Задачи уже загружены.', (0, connection_1.errorDetails)(error));
            }
        }
        return { tasks, users, userFilter: selectedUser };
    });
}
async function loadProductionTaskById(options, id, logger) {
    return (await loadProductionTasksWithSql(options, (0, queries_1.productionTaskByIdSql)(id), 'карточки задачи', logger, { id }))[0];
}
async function loadProductionTaskRichDescription(options, taskId, logger) {
    return (0, oenpSession_1.withOenpSession)(options, 'форматированного описания задачи', logger, async (connection) => {
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, (0, queries_1.productionTaskRichDescriptionSql)(taskId), options.personId), 'запрос форматированного описания задачи', logger, false, readonlyQueryTimeoutMs);
        const richDescription = (0, mapping_1.text)((0, oenpProtocol_1.parseMemoryDataPacket)(response)[0]?.richdescription);
        logger?.info('Форматированное описание задачи загружено.', { taskId, length: richDescription.length });
        return richDescription;
    });
}
async function loadProductionTasksByQuery(options, query, limit = 10, logger) {
    return loadProductionTasksWithSql(options, (0, queries_1.productionTaskSearchSql)(query, limit), 'поиска задач', logger, { query, limit });
}
async function loadProductionTasksWithSql(options, sql, requestLabel, logger, details) {
    return (0, oenpSession_1.withOenpSession)(options, requestLabel, logger, async (connection) => {
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, sql, options.personId), `запрос ${requestLabel}`, logger, true, readonlyQueryTimeoutMs);
        const tasks = (0, oenpProtocol_1.parseMemoryDataPacket)(response).map(mapping_1.mapProductionTask);
        logger?.info(`Загрузка ${requestLabel} завершена.`, { count: tasks.length, ...details });
        return tasks;
    });
}
async function loadProductionTaskReference(options, reference, logger) {
    const startedAt = Date.now();
    logger?.info('Начата загрузка связанной задачи.', { reference });
    return (0, oenpSession_1.withOenpSession)(options, 'связанной задачи', logger, async (connection) => {
        const response = await (0, connection_1.exchangeLogged)(connection, (0, oenpProtocol_1.createReadonlyQueryPacket)(8, (0, queries_1.productionTaskReferenceSql)(reference), options.personId), 'запрос связанной задачи', logger, true, readonlyQueryTimeoutMs);
        const task = (0, oenpProtocol_1.parseMemoryDataPacket)(response)[0];
        logger?.info('Связанная задача загружена.', { reference, found: Boolean(task), elapsedMs: Date.now() - startedAt });
        return task ? (0, mapping_1.mapProductionTask)(task) : undefined;
    });
}
//# sourceMappingURL=productionTasksRepository.js.map