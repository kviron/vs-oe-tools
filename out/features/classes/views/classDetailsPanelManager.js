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
exports.openClassDetails = openClassDetails;
exports.closeClassDetailPanels = closeClassDetailPanels;
const vscode = __importStar(require("vscode"));
const classRepository_1 = require("../../../infrastructure/database/classRepository");
const classDetailsTemplate_1 = require("./classDetailsTemplate");
const classDetailPanels = new Map();
let previewClassPanelId;
function updateClassDetailPanel(panel, context, classDetails) {
    panel.title = `Класс ${classDetails.name}`;
    panel.webview.html = (0, classDetailsTemplate_1.getClassDetailsHtml)(panel.webview, context.extensionUri, classDetails);
    panel.reveal(vscode.ViewColumn.Active);
}
async function openClassDetails(context, id, pinned) {
    const existingPanel = classDetailPanels.get(id);
    if (existingPanel) {
        if (pinned && !existingPanel.pinned) {
            existingPanel.pinned = true;
            previewClassPanelId = undefined;
        }
        existingPanel.panel.reveal(vscode.ViewColumn.Active);
        return;
    }
    const classDetails = await (0, classRepository_1.getClassDetails)(id);
    const previousPreviewPanelId = previewClassPanelId;
    const previewPanel = previousPreviewPanelId === undefined
        ? undefined
        : classDetailPanels.get(previousPreviewPanelId);
    if (previewPanel && previousPreviewPanelId !== undefined && !previewPanel.pinned) {
        classDetailPanels.delete(previousPreviewPanelId);
        classDetailPanels.set(id, previewPanel);
        previewPanel.pinned = pinned;
        previewClassPanelId = pinned ? undefined : id;
        updateClassDetailPanel(previewPanel.panel, context, classDetails);
        return;
    }
    const panel = vscode.window.createWebviewPanel('vc-ve-tools.classDetails', `Класс ${classDetails.name}`, vscode.ViewColumn.Active, { localResourceRoots: [context.extensionUri] });
    panel.webview.html = (0, classDetailsTemplate_1.getClassDetailsHtml)(panel.webview, context.extensionUri, classDetails);
    classDetailPanels.set(id, { panel, pinned });
    if (!pinned) {
        previewClassPanelId = id;
    }
    panel.onDidDispose(() => {
        for (const [panelId, entry] of classDetailPanels) {
            if (entry.panel === panel) {
                classDetailPanels.delete(panelId);
                if (previewClassPanelId === panelId) {
                    previewClassPanelId = undefined;
                }
            }
        }
    });
}
function isOpenClassMessage(message) {
    return typeof message === 'object'
        && message !== null
        && 'command' in message
        && 'id' in message
        && 'pinned' in message
        && message.command === 'openClass'
        && typeof message.id === 'number'
        && typeof message.pinned === 'boolean';
}
function closeClassDetailPanels() {
    for (const { panel } of [...classDetailPanels.values()]) {
        panel.dispose();
    }
    classDetailPanels.clear();
    previewClassPanelId = undefined;
}
//# sourceMappingURL=classDetailsPanelManager.js.map