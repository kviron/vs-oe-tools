import * as vscode from 'vscode';
import { projectRootSetting } from '../../core/constants';
import { applyProjectEncoding } from './projectEncodingService';

/** Owns encoding initialization, user changes and configuration-event suppression. */
export function createProjectEncodingController(context: vscode.ExtensionContext) {
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
	return {
		setEnabled: updateProjectRootSetting,
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
