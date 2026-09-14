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
exports.ProductionTasksPanelManager = void 0;
exports.registerProductionTasksActivityLauncher = registerProductionTasksActivityLauncher;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const productionTasksRepository_1 = require("./productionTasksRepository");
const productionTaskPresentation_1 = require("./productionTaskPresentation");
class ProductionTasksPanelManager {
    extensionUri;
    getOptions;
    openTask;
    importSessionKey;
    setPassword;
    logger;
    openLog;
    static viewType = 'vc-ve-tools.productionTasks';
    panel;
    tasks = new Map();
    userFilter;
    refreshPromise;
    refreshRevision = 0;
    tasksPublished = false;
    openingTasks = new Set();
    constructor(extensionUri, getOptions, openTask, importSessionKey, setPassword, logger, openLog) {
        this.extensionUri = extensionUri;
        this.getOptions = getOptions;
        this.openTask = openTask;
        this.importSessionKey = importSessionKey;
        this.setPassword = setPassword;
        this.logger = logger;
        this.openLog = openLog;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active, false);
            return;
        }
        const panel = vscode.window.createWebviewPanel(ProductionTasksPanelManager.viewType, 'Задачи', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        this.panel = panel;
        const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
        panel.webview.html = shell(panel.webview, assetsRoot);
        panel.webview.onDidReceiveMessage((message) => {
            if (!(0, webviewProtocol_1.isProductionTasksWebviewMessage)(message)) {
                return;
            }
            if (message.command === 'copyTableCells') {
                void vscode.env.clipboard.writeText(message.text);
                return;
            }
            if (message.command === 'tableSelectionDebug') {
                return;
            }
            if (message.command === 'openProductionTask') {
                void this.openTaskById(message.id);
                return;
            }
            if (message.command === 'openProductionTaskInClient') {
                const uri = vscode.Uri.parse((0, productionTaskPresentation_1.productionTaskPublicUrl)(message.id));
                void vscode.env.openExternal(uri);
                return;
            }
            if (message.command === 'importProductionSessionKey') {
                void this.importSessionKey().then(imported => { if (imported) {
                    void this.refresh(this.userFilter, true);
                } });
                return;
            }
            if (message.command === 'setProductionTasksPassword') {
                void this.setPassword().then(changed => { if (changed) {
                    void this.refresh(this.userFilter, true);
                } });
                return;
            }
            if (message.command === 'openProductionTasksLog') {
                this.openLog();
                return;
            }
            if (message.command === 'productionTasksReady') {
                // Opening or restoring the panel always starts with the signed-in user,
                // including older webviews that send a saved all-users filter.
                this.userFilter = undefined;
                void this.refresh(undefined, true);
                return;
            }
            void this.refresh(message.userFilter);
        });
        panel.onDidDispose(() => { this.panel = undefined; this.userFilter = undefined; this.refreshRevision++; this.tasks.clear(); });
    }
    refresh(userFilter = this.userFilter, force = false) {
        if (this.refreshPromise && userFilter === this.userFilter && !force && !this.tasksPublished) {
            return this.refreshPromise;
        }
        this.userFilter = userFilter;
        this.refreshRevision++;
        this.refreshPromise ??= this.refreshLatest().finally(() => { this.refreshPromise = undefined; });
        return this.refreshPromise;
    }
    async refreshLatest() {
        while (this.panel) {
            const revision = this.refreshRevision;
            const panel = this.panel;
            this.tasksPublished = false;
            await this.post({ command: 'productionTasksLoading' });
            this.logger.info('Панель запросила обновление списка задач.', { userFilter: this.userFilter ?? 'current' });
            try {
                const options = await this.getOptions();
                if (revision !== this.refreshRevision || panel !== this.panel) {
                    continue;
                }
                const result = await (0, productionTasksRepository_1.loadProductionTaskList)(options, this.userFilter, this.logger, async (loaded) => {
                    if (revision !== this.refreshRevision || panel !== this.panel) {
                        return;
                    }
                    this.userFilter = loaded.userFilter;
                    this.tasks = new Map(loaded.tasks.map(task => [task.id, task]));
                    this.tasksPublished = true;
                    await this.post({ command: 'productionTasksLoaded', ...loaded, loadedAt: new Date().toISOString(), currentPersonId: options.personId });
                });
                if (revision !== this.refreshRevision || panel !== this.panel) {
                    continue;
                }
                await this.post({ command: 'productionTaskUsersLoaded', users: result.users });
            }
            catch (error) {
                if (revision !== this.refreshRevision || panel !== this.panel) {
                    continue;
                }
                this.logger.error('Не удалось обновить список задач.', error);
                await this.post({ command: 'productionTasksFailed', message: error instanceof Error ? error.message : String(error) });
            }
            if (revision === this.refreshRevision) {
                return;
            }
        }
    }
    async openTaskById(id) {
        if (!this.tasks.has(id) || this.openingTasks.has(id)) {
            return;
        }
        this.openingTasks.add(id);
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Загрузка карточки задачи…' }, async () => {
                const task = await (0, productionTasksRepository_1.loadProductionTaskById)(await this.getOptions(), id, this.logger);
                if (task) {
                    this.openTask(task);
                }
                else {
                    void vscode.window.showInformationMessage(`Задача ${id} не найдена.`);
                }
            });
        }
        catch (error) {
            this.logger.error('Не удалось загрузить карточку задачи.', error);
            void vscode.window.showErrorMessage(`Не удалось открыть задачу ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            this.openingTasks.delete(id);
        }
    }
    dispose() { this.panel?.dispose(); this.tasks.clear(); }
    async post(message) { await this.panel?.webview.postMessage(message); }
}
exports.ProductionTasksPanelManager = ProductionTasksPanelManager;
function registerProductionTasksActivityLauncher(panel) {
    const item = new vscode.TreeItem('Открыть таблицу задач');
    item.iconPath = new vscode.ThemeIcon('list-selection');
    item.command = { command: 'vc-ve-tools.openProductionTasks', title: 'Открыть таблицу задач' };
    const view = vscode.window.createTreeView('vc-ve-tools.productionTasksLauncher', {
        treeDataProvider: {
            getTreeItem: element => element,
            getChildren: () => [item],
        },
        showCollapseAll: false,
    });
    const openFromActivityBar = async () => {
        panel.show();
        await vscode.commands.executeCommand('workbench.action.closeSidebar');
    };
    const visibility = view.onDidChangeVisibility(event => { if (event.visible) {
        void openFromActivityBar();
    } });
    if (view.visible) {
        void openFromActivityBar();
    }
    return vscode.Disposable.from(view, visibility);
}
function shell(webview, assetsRoot) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-tasks.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'webview.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задачи</title></head><body><div id="app">Загрузка…</div><script type="module" nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=productionTasksViewProvider.js.map