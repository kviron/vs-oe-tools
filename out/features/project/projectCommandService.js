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
exports.extractBatchCommand = extractBatchCommand;
exports.applyClientCredentials = applyClientCredentials;
exports.updateProjectDatabase = updateProjectDatabase;
exports.startProjectClient = startProjectClient;
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const iconv = __importStar(require("iconv-lite"));
const vscode = __importStar(require("vscode"));
function extractBatchCommand(content, sourcePath) {
    const line = content.split(/\r?\n/).map(value => value.trim()).find(value => /^@?call\s+/i.test(value));
    if (!line) {
        throw new Error(`В ${path.basename(sourcePath)} не найдена команда call.`);
    }
    const sourceDirectory = `${path.dirname(sourcePath)}${path.sep}`;
    return line.replace(/^@?call\s+/i, 'call ')
        .replace(/%~dp0[\\/]?/gi, sourceDirectory)
        .replace(/%~0/gi, sourcePath);
}
function applyClientCredentials(command, credentials) {
    for (const value of [credentials.username, credentials.password]) {
        if (value?.includes(',') || value?.includes('"')) {
            throw new Error('Логин и пароль клиента не должны содержать запятую или кавычку.');
        }
    }
    let result = command;
    if (credentials.username) {
        result = result.replace(/username=[^,\"]*/i, `username=${credentials.username}`);
    }
    if (credentials.password) {
        result = result.replace(/password=[^,\"]*/i, `password=${credentials.password}`);
    }
    return result;
}
async function readProjectCommand(workspacePath, fileName, encoding) {
    const sourcePath = path.join(workspacePath, fileName);
    const content = iconv.decode(await (0, promises_1.readFile)(sourcePath), encoding);
    return extractBatchCommand(content, sourcePath);
}
async function updateProjectDatabase(role) {
    const workspacePath = requireWorkspacePath();
    const fileName = `DBUpdate_${role}.bat`;
    const command = await readProjectCommand(workspacePath, fileName, 'win1251');
    const answer = await vscode.window.showWarningMessage(`Запустить обновление ${role === 'test' ? 'тестовой' : 'основной'} базы?`, { modal: true, detail: `Будет выполнена команда из ${fileName}.` }, 'Обновить');
    if (answer !== 'Обновить') {
        return;
    }
    const terminal = vscode.window.createTerminal({
        name: `ВЭ: обновление базы (${role})`,
        cwd: workspacePath,
        shellPath: process.env.ComSpec ?? 'cmd.exe',
        shellArgs: ['/d'],
    });
    terminal.show();
    terminal.sendText(command, true);
}
async function startProjectClient(role, credentials = {}) {
    const workspacePath = requireWorkspacePath();
    const fileName = role === 'test' ? 'start_test.bat' : 'start.bat';
    const command = applyClientCredentials(await readProjectCommand(workspacePath, fileName, 'cp866'), credentials);
    const terminal = vscode.window.createTerminal({
        name: `ВЭ: запуск клиента (${role})`,
        cwd: workspacePath,
        shellPath: process.env.ComSpec ?? 'cmd.exe',
        shellArgs: ['/d'],
    });
    terminal.show();
    terminal.sendText(command, true);
    void vscode.window.showInformationMessage(`Команда запуска клиента ВЭ отправлена: ${role === 'test' ? 'тестовая' : 'основная'} база.`);
}
function requireWorkspacePath() {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        throw new Error('Сначала откройте папку проекта Восточного Экспресса.');
    }
    return workspacePath;
}
//# sourceMappingURL=projectCommandService.js.map