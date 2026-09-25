import * as vscode from 'vscode';

export function registerUserIdCommand(context: vscode.ExtensionContext, refreshSettings: () => void): void {
	context.subscriptions.push(vscode.commands.registerCommand('vc-ve-tools.setUserId', async () => {
		const input = await vscode.window.showInputBox({
			placeHolder: '3130673',
			prompt: 'Введите ID пользователя из таблицы Users для логирования изменений методов',
			value: vscode.workspace.getConfiguration('vcVeTools').get<number>('userId', 0).toString(),
			validateInput: value => {
				if (!value.trim()) { return 'ID не может быть пустым'; }
				const parsed = Number.parseInt(value, 10);
				return Number.isInteger(parsed) && parsed > 0 ? '' : 'ID должен быть положительным числом';
			},
		});
		if (input === undefined) { return; }
		const userId = Number.parseInt(input, 10);
		await vscode.workspace.getConfiguration('vcVeTools').update('userId', userId, vscode.ConfigurationTarget.Workspace);
		refreshSettings();
		void vscode.window.showInformationMessage(`ID пользователя установлен: ${userId}`);
	}));
}
