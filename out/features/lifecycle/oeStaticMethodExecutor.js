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
exports.clientMcpMethodIds = void 0;
exports.buildOeExecTaskArguments = buildOeExecTaskArguments;
exports.executeOeStaticMethod = executeOeStaticMethod;
exports.startClientMcpProcess = startClientMcpProcess;
exports.buildClientMcpStartArguments = buildClientMcpStartArguments;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const iconv = __importStar(require("iconv-lite"));
const lifecycleMethodExecution_1 = require("./lifecycleMethodExecution");
const outputLimit = 1024 * 1024;
exports.clientMcpMethodIds = {
    start: 12464780,
    stop: 12464782,
};
function buildOeExecTaskArguments(methodId, methodParameter, database, host, credentials) {
    if (methodId !== lifecycleMethodExecution_1.createLifecycleParameterMethodId) {
        throw new Error(`Метод ${methodId} не разрешён для прямого выполнения через MCP.`);
    }
    if (!methodParameter.trim() || /[;\r\n]/u.test(methodParameter)) {
        throw new Error('Параметр метода не должен быть пустым, многострочным или содержать точку с запятой.');
    }
    const args = buildConnectionArguments(methodId, database, host, credentials);
    args.splice(-1, 0, `-MethodParam=${methodParameter}`);
    return args;
}
async function executeOeStaticMethod(workspacePath, methodId, methodParameter, database, host, credentials) {
    const executable = path.join(workspacePath, 'bin', 'OEExecTask.exe');
    if (!(await (0, promises_1.stat)(executable).catch(() => undefined))?.isFile()) {
        throw new Error(`Не найден ${executable}.`);
    }
    const args = buildOeExecTaskArguments(methodId, methodParameter, database, host, credentials);
    const output = await run(executable, args, path.dirname(executable));
    return { methodId, database, output };
}
async function startClientMcpProcess(workspacePath, database, host, credentials) {
    return startDetachedMethodProcess(workspacePath, exports.clientMcpMethodIds.start, buildClientMcpStartArguments(database, host, credentials), database);
}
async function startDetachedMethodProcess(workspacePath, methodId, args, database) {
    const executable = path.join(workspacePath, 'bin', 'OEExecTask.exe');
    if (!(await (0, promises_1.stat)(executable).catch(() => undefined))?.isFile()) {
        throw new Error(`Не найден ${executable}.`);
    }
    const child = (0, node_child_process_1.spawn)(executable, args, {
        cwd: path.dirname(executable),
        windowsHide: true,
        shell: false,
        detached: false,
        stdio: 'ignore',
    });
    await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
    });
    child.unref();
    return { methodId, database, processId: child.pid };
}
function buildClientMcpStartArguments(database, host, credentials) {
    const args = buildConnectionArguments(exports.clientMcpMethodIds.start, database, host, credentials);
    args.splice(-1, 0, '-MethodParam=1');
    return args;
}
function buildConnectionArguments(methodId, database, host, credentials) {
    for (const [label, value] of [['database', database], ['host', host], ['username', credentials.username], ['password', credentials.password]]) {
        if (value && /[,"\r\n]/u.test(value)) {
            throw new Error(`${label} содержит символ, недопустимый в параметрах подключения OEExecTask.`);
        }
    }
    if (!database.trim()) {
        throw new Error('Не указана база для выполнения метода.');
    }
    if (!credentials.username?.trim() || !credentials.password) {
        throw new Error('Для выполнения метода сохраните логин и пароль клиента Восточного Экспресса в настройках расширения.');
    }
    const login = [host.trim() && `host=${host.trim()}`, `db=${database.trim()}`,
        credentials.username?.trim() && `Username=${credentials.username.trim()}`,
        credentials.password && `password=${credentials.password}`].filter(Boolean).join(',');
    return ['-l', login, `-MethodID=${methodId}`, '-ForceOutputOEM'];
}
async function run(executable, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(executable, args, { cwd, windowsHide: true, shell: false });
        const chunks = [];
        let size = 0;
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            child.kill();
            reject(new Error('Выполнение метода Восточного Экспресса превысило 120 секунд.'));
        }, 120_000);
        const collect = (chunk) => {
            size += chunk.length;
            if (size <= outputLimit) {
                chunks.push(chunk);
            }
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.once('error', error => finish(() => reject(error)));
        child.once('close', code => finish(() => {
            const output = iconv.decode(Buffer.concat(chunks), 'cp866').trim();
            if (code !== 0) {
                reject(new Error(output || `OEExecTask завершился с кодом ${code}.`));
            }
            else {
                resolve(output);
            }
        }));
        function finish(action) {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            action();
        }
    });
}
//# sourceMappingURL=oeStaticMethodExecutor.js.map