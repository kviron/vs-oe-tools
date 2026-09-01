import * as vscode from 'vscode';
import type { DatabaseRole } from '../classes/models';

class SettingsItem extends vscode.TreeItem {
	constructor(enabled: boolean) {
		super('Использовать папку как корень проекта');
		this.checkboxState = enabled
			? vscode.TreeItemCheckboxState.Checked
			: vscode.TreeItemCheckboxState.Unchecked;
		this.tooltip = 'Открывать файлы PKF, Pascal/Delphi и BAT в кодировке Cyrillic (Windows 1251)';
	}
}

export class SettingsProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<vscode.TreeItem>();
	private readonly projectRootItem: SettingsItem;
	private readonly databaseRoleItem: vscode.TreeItem;
	private readonly testDatabaseConnectionItem: vscode.TreeItem;

	readonly onDidChangeTreeData = this.changeEmitter.event;

	constructor(enabled: boolean, databaseRole: DatabaseRole) {
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

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		return element ? [] : [this.databaseRoleItem, this.projectRootItem, this.testDatabaseConnectionItem];
	}

	setProjectRootEnabled(enabled: boolean): void {
		this.projectRootItem.checkboxState = enabled
			? vscode.TreeItemCheckboxState.Checked
			: vscode.TreeItemCheckboxState.Unchecked;
		this.changeEmitter.fire(this.projectRootItem);
	}

	setDatabaseRole(databaseRole: DatabaseRole): void {
		this.databaseRoleItem.description = databaseRole === 'main' ? 'Основная' : 'Тестовая';
		this.databaseRoleItem.tooltip = 'Нажмите, чтобы переключить базу данных';
		this.changeEmitter.fire(this.databaseRoleItem);
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}
}

