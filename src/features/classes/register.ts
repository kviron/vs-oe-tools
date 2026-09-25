import * as vscode from 'vscode';
import { configureNativeAttributeClient } from './nativeAttributeService';
import { configureEntityPropertiesActions } from './views/entityPropertiesPanelManager';
import { configureClassObjectsActions } from './views/classObjectsPanelManager';

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
	);
}
