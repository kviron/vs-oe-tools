import * as vscode from 'vscode';
import { projectRootSetting } from '../../core/constants';
import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import { SettingsViewProvider } from '../settings/settingsViewProvider';
import { openProjectClientEntity, startProjectClient } from './projectCommandService';
import { updateProjectDatabase } from './databaseUpdate';
import { applyProjectEncoding } from './projectEncodingService';
import { registerProjectStatusBar } from './projectStatusBar';
import type { createClientCredentials } from './credentials';

interface Dependencies {
	context: vscode.ExtensionContext;
	logger: ExtensionLogService;
	credentials: ReturnType<typeof createClientCredentials>;
}

export function registerProject({ context, logger, credentials }: Dependencies) {
	let isUpdatingEncodingSetting = false;
	const updateProjectRootSetting = async (enabled: boolean): Promise<void> => {
		if (!vscode.workspace.workspaceFolders?.length) {
			void vscode.window.showWarningMessage('Сначала откройте папку проекта.');
			return;
		}
		try {
			isUpdatingEncodingSetting = true;
			await vscode.workspace.getConfiguration('vcVeTools').update(
				projectRootSetting, enabled, vscode.ConfigurationTarget.Workspace,
			);
			await applyProjectEncoding(context, enabled);
			void vscode.window.showInformationMessage(enabled
				? 'PKF, Pascal и BAT-файлы будут открываться в кодировке Cyrillic (Windows 1251).'
				: 'Кодировка PKF, Pascal и BAT-файлов восстановлена.');
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
		} finally {
			isUpdatingEncodingSetting = false;
		}
	};
	const settingsProvider = new SettingsViewProvider(
		context.extensionUri, updateProjectRootSetting, logger, credentials.get, credentials.set, context.workspaceState,
	);
	context.subscriptions.push(
		settingsProvider,
		vscode.commands.registerCommand('vc-ve-tools.openSettings', () => settingsProvider.show()),
		vscode.commands.registerCommand('vc-ve-tools.openHttpApi', () => settingsProvider.showHttpApi()),
		vscode.commands.registerCommand('vc-ve-tools.updateMainDatabase', () => updateProjectDatabase('main')),
		vscode.commands.registerCommand('vc-ve-tools.updateTestDatabase', () => updateProjectDatabase('test')),
		vscode.commands.registerCommand('vc-ve-tools.startMainClient', async () => startProjectClient('main', await credentials.get())),
		vscode.commands.registerCommand('vc-ve-tools.startTestClient', async () => startProjectClient('test', await credentials.get())),
		registerProjectStatusBar(),
		vscode.commands.registerCommand('vc-ve-tools.openClientEntity',
			async (role: 'main' | 'test', entityType: string, id: number) => openProjectClientEntity(role, entityType, id, await credentials.get())),
	);
	return {
		settingsProvider,
		async onConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
			if (isUpdatingEncodingSetting || !event.affectsConfiguration(`vcVeTools.${projectRootSetting}`)) { return; }
			const enabled = vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false);
			try {
				await applyProjectEncoding(context, enabled);
			} catch (error) {
				void vscode.window.showErrorMessage(`Не удалось изменить кодировку проекта: ${String(error)}`);
			}
		},
		async initializeEncoding(): Promise<void> {
			if (vscode.workspace.getConfiguration('vcVeTools').get(projectRootSetting, false) && vscode.workspace.workspaceFolders?.length) {
				await applyProjectEncoding(context, true);
			}
		},
	};
}
