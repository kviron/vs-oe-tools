import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import type { ModuleEditorProvider } from './moduleEditorProvider';

export function createModuleAgentActions(editor: ModuleEditorProvider) {
	return {
		updateModuleSource: async (moduleId: number, code: string, expectedDatabase: string, expectedHost: string, expectedPort: number) => {
			const options = await getProjectDatabaseOptions();
			if (options.database.toLocaleLowerCase('en-US') !== expectedDatabase.trim().toLocaleLowerCase('en-US')
				|| options.host.toLocaleLowerCase('en-US') !== expectedHost.trim().toLocaleLowerCase('en-US')
				|| options.port !== expectedPort) {
				throw new Error(`Активная база расширения ${options.host}:${options.port}/${options.database} не совпадает с ожидаемой ${expectedHost}:${expectedPort}/${expectedDatabase}.`);
			}
			return { ...await editor.save(moduleId, code, options), database: options.database, host: options.host, port: options.port };
		},
	};
}
