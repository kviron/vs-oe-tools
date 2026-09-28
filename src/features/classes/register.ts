import * as vscode from 'vscode';
import { configureNativeAttributeClient } from './nativeAttributeService';
import { configureEntityPropertiesActions } from './views/entityPropertiesPanelManager';
import { configureClassObjectsActions } from './views/classObjectsPanelManager';
import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import { createLocalToolClass } from '../../infrastructure/database/localToolClassRepository';

interface Dependencies {
	getClientCredentials(): Promise<{ username: string; password: string | undefined }>;
	openMethod(id: number): Promise<void>;
	openModule(id: number): Promise<void>;
}

export function registerClasses(context: vscode.ExtensionContext, dependencies: Dependencies): void {
	context.subscriptions.push(
		configureNativeAttributeClient(dependencies.getClientCredentials),
		configureEntityPropertiesActions({ openMethodCode: dependencies.openMethod }),
		configureClassObjectsActions({ openModuleCode: dependencies.openModule }),
		vscode.commands.registerCommand('vc-ve-tools.createLocalToolClass', async () => {
			const name = await vscode.window.showInputBox({ title: 'Непакетный класс для инструментов',
				prompt: 'Имя нового класса BaseUtils', ignoreFocusOut: true });
			if (name === undefined) { return; }
			try {
				const options = await getProjectDatabaseOptions();
				const created = await createLocalToolClass(name, options.database, options.host, options.port);
				await vscode.window.showInformationMessage(`Класс ${created.name} (ID ${created.id}) создан в ${created.database} без пакетной привязки. Перезапустите клиент Восточного Экспресса, чтобы обновить кэш классов.`);
			} catch (error) {
				await vscode.window.showErrorMessage(`Не удалось создать класс: ${error instanceof Error ? error.message : String(error)}`);
			}
		}),
	);
}
