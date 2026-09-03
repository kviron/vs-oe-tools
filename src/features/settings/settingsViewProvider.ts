import * as vscode from 'vscode';
import { databaseRoleSetting, mcpEnabledSetting, projectRootSetting } from '../../core/constants';
import type { SettingsHostMessage, SettingsState } from '../../core/webviewProtocol';
import { isSettingsWebviewMessage } from '../../core/webviewProtocol';
import { getDatabaseRole } from '../../infrastructure/configuration/projectDatabaseOptions';
import { testDatabaseConnection } from '../../infrastructure/database/classRepository';

export class SettingsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'vc-ve-tools.settings';
	private view?: vscode.WebviewView;
	private readonly disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly setProjectRootEnabled: (enabled: boolean) => Promise<void>,
	) {
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('vcVeTools')) {
					void this.postState();
				}
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()),
		);
	}

	public resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
		view.webview.options = { enableScripts: true, localResourceRoots: [assetsRoot] };
		view.webview.html = this.getHtml(view.webview, assetsRoot);
		view.webview.onDidReceiveMessage(message => void this.handleMessage(message));
		view.onDidDispose(() => { this.view = undefined; });
	}

	public refresh(): void {
		void this.postState();
	}

	public dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!isSettingsWebviewMessage(message)) {
			return;
		}
		if (message.command === 'settingsReady') {
			await this.postState();
		} else if (message.command === 'setProjectRootEnabled') {
			await this.setProjectRootEnabled(message.enabled);
		} else if (message.command === 'setDatabaseRole') {
			await vscode.workspace.getConfiguration('vcVeTools').update(databaseRoleSetting, message.role, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'setUserId') {
			await vscode.workspace.getConfiguration('vcVeTools').update('userId', message.userId, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'setMcpEnabled') {
			await vscode.workspace.getConfiguration('vcVeTools').update(mcpEnabledSetting, message.enabled, vscode.ConfigurationTarget.Workspace);
		} else if (message.command === 'testSettingsDatabaseConnection') {
			await this.testConnection();
		} else {
			await vscode.env.clipboard.writeText(message.text);
			vscode.window.setStatusBarMessage('Код подключения MCP скопирован', 2500);
		}
	}

	private async testConnection(): Promise<void> {
		this.post({ command: 'databaseConnectionTestStarted' });
		try {
			const result = await testDatabaseConnection();
			this.post({ command: 'databaseConnectionTestFinished', success: true, message: `Подключено: ${result.database}, пользователь ${result.user}.` });
		} catch (error) {
			this.post({ command: 'databaseConnectionTestFinished', success: false, message: error instanceof Error ? error.message : String(error) });
		}
	}

	private async postState(): Promise<void> {
		if (!this.view) {
			return;
		}
		this.post({ command: 'settingsState', state: await this.getState() });
	}

	private async getState(): Promise<SettingsState> {
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const workspace = vscode.workspace.workspaceFolders?.[0];
		const enabled = configuration.get<boolean>(mcpEnabledSetting, true);
		const role = getDatabaseRole();
		let status: SettingsState['mcpStatus'] = enabled ? 'ready' : 'disabled';
		let statusText = enabled ? 'Готов к запуску агентом' : 'MCP-сервер выключен';
		if (enabled && !workspace) {
			status = 'unavailable';
			statusText = 'Откройте папку проекта';
		} else if (enabled && workspace) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspace.uri, 'Vars.bat'));
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.extensionUri, 'dist', 'mcp-server.js'));
			} catch {
				status = 'unavailable';
				statusText = 'Не найден Vars.bat или сборка MCP-сервера';
			}
		}
		return {
			useFolderAsProjectRoot: configuration.get(projectRootSetting, false),
			databaseRole: role,
			userId: configuration.get<number>('userId', 0),
			mcpEnabled: enabled,
			mcpStatus: status,
			mcpStatusText: statusText,
			mcpConnectionCode: this.connectionCode(workspace?.uri.fsPath, role),
		};
	}

	private connectionCode(workspacePath: string | undefined, role: 'main' | 'test'): string {
		return JSON.stringify({
			mcpServers: {
				'vc-ve-tools': {
					command: 'node',
					args: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'mcp-server.js').fsPath, '--workspace', workspacePath ?? '<PROJECT_PATH>', '--database-role', role],
				},
			},
		}, null, 2);
	}

	private post(message: SettingsHostMessage): void {
		void this.view?.webview.postMessage(message);
	}

	private getHtml(webview: vscode.Webview, assetsRoot: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'settings.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'settings.css'));
		const nonce = createNonce();
		return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${styleUri}"><title>Настройки</title></head><body><div id="app"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
	}
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
