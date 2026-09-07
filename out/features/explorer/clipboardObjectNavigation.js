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
exports.registerClipboardObjectNavigation = registerClipboardObjectNavigation;
const vscode = __importStar(require("vscode"));
const clipboardObjectRouting_1 = require("./clipboardObjectRouting");
function registerClipboardObjectNavigation(actions) {
    return vscode.commands.registerCommand('vc-ve-tools.openClipboardObject', async () => {
        const id = (0, clipboardObjectRouting_1.parseClipboardObjectId)(await vscode.env.clipboard.readText());
        if (id === undefined) {
            void vscode.window.showWarningMessage('В буфере обмена нет корректного положительного ID объекта.');
            return;
        }
        try {
            const object = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Поиск объекта ID=${id}` }, () => actions.findById(id));
            if (!object) {
                throw new Error(`Объект ID=${id} не найден.`);
            }
            const selected = await vscode.window.showQuickPick([
                { label: 'Показать в проводнике', description: explorerDescription(object.kind), target: 'explorer' },
                { label: 'Открыть объект', description: objectDescription(object.kind), target: 'object' },
            ], {
                placeHolder: `${object.name || 'Объект'} · ID=${id}`,
                title: 'Как открыть объект?',
            });
            if (selected) {
                await (0, clipboardObjectRouting_1.navigateToDatabaseObject)(object, selected.target, actions);
            }
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Не удалось открыть объект ID=${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}
function explorerDescription(kind) {
    if (kind === 'method') {
        return 'Открыть родительский класс и выделить метод';
    }
    if (kind === 'attribute') {
        return 'Показать родительский класс';
    }
    if (kind === 'class') {
        return 'Раскрыть класс в дереве';
    }
    return 'Открыть справочник класса';
}
function objectDescription(kind) {
    if (kind === 'method') {
        return 'Открыть код метода в редакторе';
    }
    if (kind === 'attribute') {
        return 'Открыть карточку атрибута';
    }
    if (kind === 'class') {
        return 'Открыть карточку класса';
    }
    return 'Открыть просмотр записи справочника';
}
//# sourceMappingURL=clipboardObjectNavigation.js.map