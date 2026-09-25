import * as vscode from 'vscode';

interface Dependencies {
	onDatabaseConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void>;
	onMcpConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void>;
	onProjectConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void>;
	publishActiveDatabaseSelection(): Promise<void>;
	publishMcpRuntimeState(): Promise<void>;
}

export function registerLifecycle(dependencies: Dependencies): vscode.Disposable {
	const { onDatabaseConfigurationChange, onMcpConfigurationChange, onProjectConfigurationChange,
		publishActiveDatabaseSelection, publishMcpRuntimeState } = dependencies;
	const configurationListener = vscode.workspace.onDidChangeConfiguration(async event => {
		await onDatabaseConfigurationChange(event);
		await onMcpConfigurationChange(event);
		await onProjectConfigurationChange(event);
	});
	const activeWorkspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		void publishActiveDatabaseSelection();
		void publishMcpRuntimeState();
	});
	const activeWindowListener = vscode.window.onDidChangeWindowState(state => {
		if (state.focused) {
			void publishActiveDatabaseSelection();
			void publishMcpRuntimeState();
		}
	});
	return vscode.Disposable.from(configurationListener, activeWorkspaceListener, activeWindowListener);
}
