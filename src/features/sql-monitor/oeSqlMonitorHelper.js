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
const pty = __importStar(require("node-pty"));
const [, , executable, ...args] = process.argv;
if (!executable) {
    process.stderr.write('Не указан путь к OESQLMonCon.exe.\n');
    process.exit(2);
}
let terminal;
let finished = false;
function stop() {
    if (finished || !terminal) {
        return;
    }
    try {
        terminal.write('\r');
    }
    catch { /* The PTY has already exited. */ }
}
function fail(error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
}
try {
    terminal = pty.spawn(executable, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: process.cwd(),
        env: process.env,
        useConpty: true,
    });
    terminal.onData(data => process.stdout.write(data));
    terminal.onExit(({ exitCode }) => {
        finished = true;
        setTimeout(() => process.exit(exitCode), 50);
    });
    process.stdin.once('data', stop);
    setTimeout(stop, 1500);
    setTimeout(() => fail(new Error('OESQLMonCon не завершился за 8 секунд.')), 8000);
}
catch (error) {
    fail(error);
}
function formatError(value) {
    return value instanceof Error ? value.stack ?? value.message : String(value);
}
//# sourceMappingURL=oeSqlMonitorHelper.js.map