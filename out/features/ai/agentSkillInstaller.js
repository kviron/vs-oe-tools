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
exports.registerAgentSkillInstaller = registerAgentSkillInstaller;
const vscode = __importStar(require("vscode"));
const agentSkillFiles_1 = require("./agentSkillFiles");
const agentSkillUpdates_1 = require("./agentSkillUpdates");
function registerAgentSkillInstaller(context) {
    const command = vscode.commands.registerCommand('vc-ve-tools.installAgentSkills', async () => {
        try {
            const workspaceFolder = await selectWorkspaceFolder();
            if (workspaceFolder) {
                await installBundledSkill(context, workspaceFolder);
            }
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось установить навык Восточного Экспресса: ${errorMessage(error)}`);
        }
    });
    let synchronization = Promise.resolve();
    const synchronize = () => {
        synchronization = synchronization.then(async () => {
            await (0, agentSkillUpdates_1.updateManagedSkills)(context);
            await (0, agentSkillUpdates_1.ensureBundledSkills)(context);
        }).catch((error) => {
            console.error('Не удалось подключить навык Восточного Экспресса:', error);
        });
    };
    synchronize();
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(synchronize);
    return vscode.Disposable.from(command, workspaceListener);
}
async function installBundledSkill(context, workspaceFolder) {
    const source = (0, agentSkillFiles_1.bundledSkillSource)(context);
    const bundledContent = await vscode.workspace.fs.readFile(source);
    let installed = 0;
    let current = 0;
    for (const location of agentSkillFiles_1.skillLocations) {
        const target = (0, agentSkillFiles_1.skillTarget)(workspaceFolder, location);
        const existingContent = await (0, agentSkillFiles_1.readFileIfExists)(target);
        if (existingContent && (0, agentSkillFiles_1.buffersEqual)(existingContent, bundledContent)) {
            await (0, agentSkillFiles_1.saveInstalledState)(context, workspaceFolder, bundledContent, location);
            current += 1;
            continue;
        }
        if (existingContent) {
            const choice = await vscode.window.showWarningMessage(`Навык Восточного Экспресса уже существует в ${vscode.workspace.asRelativePath(target, false)}. Обновить его встроенной версией?`, { modal: true }, 'Обновить', 'Сравнить');
            if (choice === 'Сравнить') {
                await (0, agentSkillFiles_1.openSkillDiff)(source, target);
                continue;
            }
            if (choice !== 'Обновить') {
                continue;
            }
        }
        await (0, agentSkillFiles_1.writeBundledSkill)(context, workspaceFolder, bundledContent, location);
        installed += 1;
    }
    if (installed === agentSkillFiles_1.skillLocations.length || installed + current === agentSkillFiles_1.skillLocations.length) {
        void vscode.window.showInformationMessage('Навык Восточного Экспресса доступен для Codex, Cursor и Claude Code в папке проекта.');
    }
    else if (installed > 0) {
        void vscode.window.showInformationMessage(`Навык Восточного Экспресса установлен в ${installed} из ${agentSkillFiles_1.skillLocations.length} каталогов агентов.`);
    }
}
async function selectWorkspaceFolder() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
        void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
        return undefined;
    }
    if (folders.length === 1) {
        return folders[0];
    }
    return vscode.window.showWorkspaceFolderPick({ placeHolder: 'Выберите проект для установки навыка Восточного Экспресса' });
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=agentSkillInstaller.js.map