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
                const task = this.tasks.get(message.id);
                if (task) {
                    this.openTask(task);
                }
                return;
            }
            if (message.command === 'openProductionTaskInClient') {
                const uri = vscode.Uri.parse((0, productionTaskPresentation_1.productionTaskPublicUrl)(message.id));
                void vscode.env.openExternal(uri);
                return;
            }
            if (message.command === 'importProductionSessionKey') {
                void this.importSessionKey().then(imported => { if (imported) {
                    void this.refresh();
                } });
                return;
            }
            if (message.command === 'setProductionTasksPassword') {
                void this.setPassword().then(changed => { if (changed) {
                    void this.refresh();
                } });
                return;
            }
            if (message.command === 'openProductionTasksLog') {
                this.openLog();
                return;
            }
            void this.refresh();
        });
        panel.onDidDispose(() => { this.panel = undefined; this.tasks.clear(); });
    }
    async refresh() {
        await this.post({ command: 'productionTasksLoading' });
        this.logger.info('Панель запросила обновление списка задач.');
        try {
            const tasks = await (0, productionTasksRepository_1.loadProductionTasks)(await this.getOptions(), this.logger);
            this.tasks = new Map(tasks.map(task => [task.id, task]));
            await this.post({ command: 'productionTasksLoaded', tasks, loadedAt: new Date().toISOString() });
        }
        catch (error) {
            this.logger.error('Не удалось обновить список задач.', error);
            await this.post({ command: 'productionTasksFailed', message: error instanceof Error ? error.message : String(error) });
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
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'production-tasks.css'));
    const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Задачи</title></head><body><div id="app">Загрузка…</div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
//# sourceMappingURL=productionTasksViewProvider.js.map