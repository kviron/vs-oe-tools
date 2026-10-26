"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProductionTasks = loadProductionTasks;
exports.loadProductionTaskList = loadProductionTaskList;
exports.loadProductionTaskById = loadProductionTaskById;
exports.loadProductionTasksByQuery = loadProductionTasksByQuery;
exports.loadProductionTaskReference = loadProductionTaskReference;
exports.loadProductionTaskRichDescription = loadProductionTaskRichDescription;
exports.loadProductionTaskHistory = loadProductionTaskHistory;
exports.loadProductionTaskAttachments = loadProductionTaskAttachments;
exports.loadProductionTaskActions = loadProductionTaskActions;
const oenp = __importStar(require("./productionOenpRepository"));
const productionMcpRepository_1 = require("./productionMcpRepository");
/** Routes reads to the selected backend and reports unsupported public-MCP capabilities. */
function isMcp(options) {
    return 'transport' in options && options.transport === 'mcp';
}
function unavailable(feature) { throw new Error('Публичный MCP пока не предоставляет ' + feature + '. Для этих данных переключите источник задач на OENP.'); }
async function loadProductionTasks(options, logger) {
    return isMcp(options) ? (0, productionMcpRepository_1.listMcpTasks)(options) : oenp.loadProductionTasks(options, logger);
}
async function loadProductionTaskList(options, userFilter, logger, onTasksLoaded) {
    if (!isMcp(options)) {
        return oenp.loadProductionTaskList(options, userFilter, logger, onTasksLoaded);
    }
    const result = { tasks: await (0, productionMcpRepository_1.listMcpTasks)(options), users: [], userFilter: '' };
    await onTasksLoaded?.(result);
    return result;
}
async function loadProductionTaskById(options, id, logger) {
    return isMcp(options) ? (0, productionMcpRepository_1.readMcpTask)(options, id) : oenp.loadProductionTaskById(options, id, logger);
}
async function loadProductionTasksByQuery(options, query, limit = 10, logger, folderUri) {
    return isMcp(options) ? (0, productionMcpRepository_1.searchMcpTasks)(options, query, limit, folderUri) : oenp.loadProductionTasksByQuery(options, query, limit, logger);
}
async function loadProductionTaskReference(options, reference, logger) {
    return isMcp(options) ? (await (0, productionMcpRepository_1.searchMcpTasks)(options, String(reference), 1))[0] : oenp.loadProductionTaskReference(options, reference, logger);
}
async function loadProductionTaskRichDescription(options, id, logger) {
    return isMcp(options) ? unavailable('форматированное описание') : oenp.loadProductionTaskRichDescription(options, id, logger);
}
async function loadProductionTaskHistory(options, id, logger) {
    return isMcp(options) ? unavailable('историю задачи') : oenp.loadProductionTaskHistory(options, id, logger);
}
async function loadProductionTaskAttachments(options, id, logger) {
    return isMcp(options) ? unavailable('вложения задачи') : oenp.loadProductionTaskAttachments(options, id, logger);
}
async function loadProductionTaskActions(options, id, logger) {
    return isMcp(options) ? unavailable('действия задачи') : oenp.loadProductionTaskActions(options, id, logger);
}
//# sourceMappingURL=productionTasksRepository.js.map