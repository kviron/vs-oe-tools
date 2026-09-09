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
exports.SvnConflictPanel = void 0;
const vscode = __importStar(require("vscode"));
const webviewProtocol_1 = require("../../core/webviewProtocol");
const svnMergeService_1 = require("./svnMergeService");
class SvnConflictPanel {
    extensionUri;
    onResolved;
    panel;
    filePath;
    conflict;
    constructor(extensionUri, onResolved) {
        this.extensionUri = extensionUri;
        this.onResolved = onResolved;
    }
    async show(workingCopy, relativePath) {
        const conflict = await (0, svnMergeService_1.loadConflictContent)(workingCopy, relativePath);
        this.filePath = conflict.filePath;
        this.conflict = conflict;
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('vc-ve-tools.svnConflict', `Конфликт: ${relativePath}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
            const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
            this.panel.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
            this.panel.webview.html = this.html(this.panel.webview, assetsRoot);
            this.panel.webview.onDidReceiveMessage(message => { void this.receive(message); });
            this.panel.onDidDispose(() => { this.panel = undefined; this.filePath = undefined; this.conflict = undefined; });
        }
        else {
            this.panel.title = `Конфликт: ${relativePath}`;
            this.panel.reveal(undefined, false);
        }
        await this.post({ command: 'svnConflictLoaded', conflict });
    }
    dispose() { this.panel?.dispose(); }
    async receive(message) {
        if (!(0, webviewProtocol_1.isSvnConflictWebviewMessage)(message)) {
            return;
        }
        if (message.command === 'svnConflictReady') {
            if (this.conflict) {
                await this.post({ command: 'svnConflictLoaded', conflict: this.conflict });
            }
            return;
        }
        if (!this.filePath) {
            return;
        }
        await this.post({ command: 'svnConflictSaving' });
        try {
            await (0, svnMergeService_1.saveConflictResult)(this.filePath, message.content, message.resolve);
            await this.post({ command: 'svnConflictSaved', resolved: message.resolve });
            if (message.resolve) {
                this.onResolved(this.filePath);
            }
        }
        catch (error) {
            await this.post({ command: 'svnConflictFailed', message: error instanceof Error ? error.message : String(error) });
        }
    }
    async post(message) { await this.panel?.webview.postMessage(message); }
    html(webview, assetsRoot) {
        const script = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'svn-conflict.js'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'svn-conflict.css'));
        const nonce = Math.random().toString(36).slice(2);
        return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csp-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"><title>Разрешение SVN-конфликта</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    }
}
exports.SvnConflictPanel = SvnConflictPanel;
//# sourceMappingURL=svnConflictPanel.js.map