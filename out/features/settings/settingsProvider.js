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
exports.SettingsProvider = void 0;
const vscode = __importStar(require("vscode"));
class SettingsItem extends vscode.TreeItem {
    constructor(enabled) {
        super('Использовать папку как корень проекта');
        this.checkboxState = enabled
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
        this.tooltip = 'Открывать файлы PKF, Pascal/Delphi и BAT в кодировке Cyrillic (Windows 1251)';
    }
}
class SettingsProvider {
    changeEmitter = new vscode.EventEmitter();
    projectRootItem;
    databaseRoleItem;
    testDatabaseConnectionItem;
    onDidChangeTreeData = this.changeEmitter.event;
    constructor(enabled, databaseRole) {
        this.projectRootItem = new SettingsItem(enabled);
        this.databaseRoleItem = new vscode.TreeItem('База данных');
        this.databaseRoleItem.command = {
            command: 'vc-ve-tools.selectDatabaseRole',
            title: 'Выбрать базу данных',
        };
        this.databaseRoleItem.iconPath = new vscode.ThemeIcon('database');
        this.setDatabaseRole(databaseRole);
        this.testDatabaseConnectionItem = new vscode.TreeItem('Проверить подключение к базе');
        this.testDatabaseConnectionItem.command = {
            command: 'vc-ve-tools.testDatabaseConnection',
            title: 'Проверить подключение к базе',
        };
        this.testDatabaseConnectionItem.iconPath = new vscode.ThemeIcon('plug');
        this.testDatabaseConnectionItem.tooltip = 'Проверить подключение к PostgreSQL по данным из Vars.bat';
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        return element ? [] : [this.databaseRoleItem, this.projectRootItem, this.testDatabaseConnectionItem];
    }
    setProjectRootEnabled(enabled) {
        this.projectRootItem.checkboxState = enabled
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
        this.changeEmitter.fire(this.projectRootItem);
    }
    setDatabaseRole(databaseRole) {
        this.databaseRoleItem.description = databaseRole === 'main' ? 'Основная' : 'Тестовая';
        this.databaseRoleItem.tooltip = 'Нажмите, чтобы переключить базу данных';
        this.changeEmitter.fire(this.databaseRoleItem);
    }
    dispose() {
        this.changeEmitter.dispose();
    }
}
exports.SettingsProvider = SettingsProvider;
//# sourceMappingURL=settingsProvider.js.map