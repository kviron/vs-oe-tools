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
exports.getSessionContext = getSessionContext;
const node_os_1 = require("node:os");
const vscode = __importStar(require("vscode"));
const databaseQueryExecutor_1 = require("../database/databaseQueryExecutor");
/**
 * Получает контекст текущей сессии из настроек расширения и сервера БД
 * @param client PostgreSQL клиент
 * @param databaseName Название БД для логирования
 * @returns Контекст сессии с UserID, ComputerName и текущей датой
 */
async function getSessionContext(client, databaseName) {
    // Получаем текущее время от сервера БД
    const timeResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: 'SELECT NOW() AS now',
        values: [],
        source: 'Получение времени сервера БД',
        database: databaseName,
    });
    const changeDate = timeResult.rows[0]?.now ?? new Date();
    // Получаем имя компьютера из ОС
    const localComputerName = (0, node_os_1.hostname)();
    const computerResult = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
        text: `SELECT computername
		 FROM packagestune
		 WHERE upper(computername) = upper($1)
		    OR upper(computername) LIKE upper($1) || '.%'
		 ORDER BY CASE WHEN upper(computername) = upper($1) THEN 0 ELSE 1 END
		 LIMIT 1`,
        values: [localComputerName],
        source: 'Получение имени компьютера ВЭ',
        database: databaseName,
    });
    const computerName = computerResult.rows[0]?.computername ?? localComputerName;
    // Получаем UserID из настроек расширения
    const userId = await getUserId();
    return {
        userId,
        computerName,
        changeDate,
    };
}
async function getUserId() {
    const configuration = vscode.workspace.getConfiguration('vcVeTools');
    const configured = configuration.get('userId', 0);
    if (Number.isSafeInteger(configured) && configured > 0) {
        return configured;
    }
    // Поддерживаем старый способ настройки, но переменная окружения больше не обязательна.
    const legacy = Number.parseInt(process.env.VC_VE_USER_ID ?? '', 10);
    if (Number.isSafeInteger(legacy) && legacy > 0) {
        await configuration.update('userId', legacy, vscode.ConfigurationTarget.Workspace);
        return legacy;
    }
    const input = await vscode.window.showInputBox({
        title: 'Сохранение метода',
        prompt: 'Введите ID пользователя из таблицы Users. Он сохранится в настройках проекта.',
        placeHolder: 'ID пользователя',
        ignoreFocusOut: true,
        validateInput: validateUserId,
    });
    if (input === undefined) {
        throw new Error('Сохранение отменено: не указан ID пользователя для журнала изменений.');
    }
    const userId = Number.parseInt(input, 10);
    await configuration.update('userId', userId, vscode.ConfigurationTarget.Workspace);
    return userId;
}
function validateUserId(value) {
    return /^[1-9]\d*$/.test(value.trim()) && Number.isSafeInteger(Number(value))
        ? undefined
        : 'Введите положительный целочисленный ID пользователя.';
}
//# sourceMappingURL=sessionContext.js.map