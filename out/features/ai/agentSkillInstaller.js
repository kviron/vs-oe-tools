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
const node_crypto_1 = require("node:crypto");
const vscode = __importStar(require("vscode"));
const bundledSkill = { name: 'east-express', version: 2 };
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
    void updateManagedSkills(context).catch((error) => {
        console.error('Не удалось проверить обновления навыков Восточного Экспресса:', error);
    });
    return command;
}
async function installBundledSkill(context, workspaceFolder) {
    const source = bundledSkillSource(context);
    const targetDirectory = skillTargetDirectory(workspaceFolder);
    const target = vscode.Uri.joinPath(targetDirectory, 'SKILL.md');
    const bundledContent = await vscode.workspace.fs.readFile(source);
    const existingContent = await readFileIfExists(target);
    if (existingContent && buffersEqual(existingContent, bundledContent)) {
        await saveInstalledState(context, workspaceFolder, bundledContent);
        void vscode.window.showInformationMessage('Навык Восточного Экспресса уже установлен и актуален.');
        return;
    }
    if (existingContent) {
        const choice = await vscode.window.showWarningMessage('Навык Восточного Экспресса уже существует в проекте. Обновить его встроенной версией?', { modal: true }, 'Обновить', 'Сравнить');
        if (choice === 'Сравнить') {
            await openSkillDiff(source, target);
            return;
        }
        if (choice !== 'Обновить') {
            return;
        }
    }
    await writeBundledSkill(context, workspaceFolder, bundledContent);
    void vscode.window.showInformationMessage(`Навык Восточного Экспресса установлен в ${vscode.workspace.asRelativePath(target, false)}.`);
}
async function updateManagedSkills(context) {
    for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
        const state = context.workspaceState.get(stateKey(workspaceFolder));
        if (!state) {
            continue;
        }
        const source = bundledSkillSource(context);
        const target = vscode.Uri.joinPath(skillTargetDirectory(workspaceFolder), 'SKILL.md');
        const [bundledContent, installedContent] = await Promise.all([
            vscode.workspace.fs.readFile(source),
            readFileIfExists(target),
        ]);
        if (!installedContent) {
            await context.workspaceState.update(stateKey(workspaceFolder), undefined);
            continue;
        }
        const bundledHash = contentHash(bundledContent);
        if (buffersEqual(installedContent, bundledContent)) {
            if (state.installedHash !== bundledHash || state.version !== bundledSkill.version) {
                await saveInstalledState(context, workspaceFolder, bundledContent);
            }
            continue;
        }
        if (state.dismissedBundledHash === bundledHash) {
            continue;
        }
        if (contentHash(installedContent) === state.installedHash) {
            await writeBundledSkill(context, workspaceFolder, bundledContent);
            void vscode.window.showInformationMessage(`Навык Восточного Экспресса автоматически обновлён до версии ${bundledSkill.version}.`);
            continue;
        }
        const choice = await vscode.window.showWarningMessage(`Доступно обновление навыка Восточного Экспресса до версии ${bundledSkill.version}, но установленный файл изменён.`, 'Обновить', 'Сравнить', 'Оставить свой');
        if (choice === 'Обновить') {
            await writeBundledSkill(context, workspaceFolder, bundledContent);
        }
        else if (choice === 'Сравнить') {
            await openSkillDiff(source, target);
        }
        else if (choice === 'Оставить свой') {
            await context.workspaceState.update(stateKey(workspaceFolder), {
                ...state,
                dismissedBundledHash: bundledHash,
            });
        }
    }
}
async function writeBundledSkill(context, workspaceFolder, bundledContent) {
    const targetDirectory = skillTargetDirectory(workspaceFolder);
    await vscode.workspace.fs.createDirectory(targetDirectory);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(targetDirectory, 'SKILL.md'), bundledContent);
    await saveInstalledState(context, workspaceFolder, bundledContent);
}
async function saveInstalledState(context, workspaceFolder, content) {
    await context.workspaceState.update(stateKey(workspaceFolder), {
        version: bundledSkill.version,
        installedHash: contentHash(content),
    });
}
function bundledSkillSource(context) {
    return vscode.Uri.joinPath(context.extensionUri, 'resources', 'agent-skills', bundledSkill.name, 'SKILL.md');
}
function skillTargetDirectory(workspaceFolder) {
    return vscode.Uri.joinPath(workspaceFolder.uri, '.agents', 'skills', bundledSkill.name);
}
function stateKey(workspaceFolder) {
    return `agentSkill.${bundledSkill.name}.${contentHash(Buffer.from(workspaceFolder.uri.toString()))}`;
}
async function openSkillDiff(source, target) {
    await vscode.commands.executeCommand('vscode.diff', target, source, 'Навык Восточного Экспресса: установленный ↔ встроенный');
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
async function readFileIfExists(uri) {
    try {
        return await vscode.workspace.fs.readFile(uri);
    }
    catch (error) {
        if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
            return undefined;
        }
        throw error;
    }
}
function contentHash(content) {
    return (0, node_crypto_1.createHash)('sha256').update(content).digest('hex');
}
function buffersEqual(left, right) {
    return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=agentSkillInstaller.js.map