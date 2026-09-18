import * as vscode from 'vscode';
import type { ProjectDatabaseRole } from './projectCommandService';

interface ProjectRoleAction {
	label: string;
	description: string;
	role: ProjectDatabaseRole;
}

export const projectRoleActions: readonly ProjectRoleAction[] = [
	{ label: 'Основная база', description: 'main', role: 'main' },
	{ label: 'Тестовая база', description: 'test', role: 'test' },
];

export function activeDatabaseStatusText(profile: string, role: ProjectDatabaseRole): string {
	return `$(database) ${profile.trim() || (role === 'test' ? 'Тестовая' : 'Основная')} $(chevron-down)`;
}

export function registerProjectStatusBar(): vscode.Disposable {
	const quickStartCommand = vscode.commands.registerCommand('vc-ve-tools.quickStartClient', async () => {
		const selected = await pickProjectRole('Запустить клиент для базы данных');
		if (!selected) { return; }
		await executeProjectCommand(
			selected.role === 'test' ? 'vc-ve-tools.startTestClient' : 'vc-ve-tools.startMainClient',
			'Не удалось запустить клиент',
		);
	});

	const quickUpdateCommand = vscode.commands.registerCommand('vc-ve-tools.quickUpdateDatabase', async () => {
		const selected = await pickProjectRole('Обновить базу данных');
		if (!selected) { return; }
		await executeProjectCommand(
			selected.role === 'test' ? 'vc-ve-tools.updateTestDatabase' : 'vc-ve-tools.updateMainDatabase',
			'Не удалось запустить обновление базы',
		);
	});

	const startItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 91);
	startItem.name = 'Восточный Экспресс: запуск клиента';
	startItem.text = '$(play) ВЭ $(chevron-down)';
	startItem.tooltip = 'Запустить клиент Восточного Экспресса — выбрать базу';
	startItem.command = 'vc-ve-tools.quickStartClient';
	startItem.show();

	const updateItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
	updateItem.name = 'Восточный Экспресс: обновление базы';
	updateItem.text = '$(sync) БД $(chevron-down)';
	updateItem.tooltip = 'Обновить базу Восточного Экспресса — выбрать основную или тестовую';
	updateItem.command = 'vc-ve-tools.quickUpdateDatabase';
	updateItem.show();

	const databaseItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 92);
	databaseItem.name = 'Восточный Экспресс: активная база';
	databaseItem.tooltip = 'Переключить активную базу данных Восточного Экспресса';
	databaseItem.command = 'vc-ve-tools.selectDatabaseRole';
	const refreshDatabaseItem = (): void => {
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const profile = configuration.get<string>('databaseProfile', '');
		const role = configuration.get<ProjectDatabaseRole>('databaseRole', 'main');
		databaseItem.text = activeDatabaseStatusText(profile, role);
	};
	refreshDatabaseItem();
	databaseItem.show();
	const configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('vcVeTools.databaseProfile')
			|| event.affectsConfiguration('vcVeTools.databaseRole')) {
			refreshDatabaseItem();
		}
	});

	return vscode.Disposable.from(
		quickStartCommand,
		quickUpdateCommand,
		databaseItem,
		startItem,
		updateItem,
		configurationListener,
	);
}

async function pickProjectRole(placeHolder: string): Promise<ProjectRoleAction | undefined> {
	return vscode.window.showQuickPick(
		projectRoleActions.map(action => ({
			...action,
			iconPath: new vscode.ThemeIcon(action.role === 'test' ? 'beaker' : 'database'),
		})),
		{ placeHolder },
	);
}

async function executeProjectCommand(command: string, errorPrefix: string): Promise<void> {
	try {
		await vscode.commands.executeCommand(command);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(`${errorPrefix}: ${message}`);
	}
}
