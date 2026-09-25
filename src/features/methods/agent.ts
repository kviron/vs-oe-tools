import { getProjectDatabaseOptions } from '../../infrastructure/configuration/projectDatabaseOptions';
import type { MethodEditorProvider } from './methodEditorProvider';
import type { MethodCompilationService } from './methodCompilationService';
import type { MethodCompilationHistory } from './methodCompilationHistory';

export function createMethodAgentActions(
	methodEditor: MethodEditorProvider,
	compilation: MethodCompilationService,
	history: MethodCompilationHistory,
) {
	return {
		openMethod: (id: number) => methodEditor.open(id),
		updateMethodSource: async (methodId: number, code: string, expectedDatabase: string, expectedHost: string, expectedPort: number) => {
			const options = await getProjectDatabaseOptions();
			if (options.database.toLocaleLowerCase('en-US') !== expectedDatabase.toLocaleLowerCase('en-US')
				|| options.host.toLocaleLowerCase('en-US') !== expectedHost.toLocaleLowerCase('en-US') || options.port !== expectedPort) {
				throw new Error(`Активная база расширения ${options.host}:${options.port}/${options.database} не совпадает с ожидаемой ${expectedHost}:${expectedPort}/${expectedDatabase}.`);
			}
			const saved = await methodEditor.save(methodId, code);
			const checked = await compilation.check(methodId, options.database, options.host, 'agent');
			return { ...saved, database: options.database, compilation: checked };
		},
		compileMethod: async (methodId: number, expectedDatabase: string, expectedHost: string, expectedPort: number) => {
			const options = await getProjectDatabaseOptions();
			if (options.database.toLocaleLowerCase('en-US') !== expectedDatabase.toLocaleLowerCase('en-US')
				|| options.host.toLocaleLowerCase('en-US') !== expectedHost.toLocaleLowerCase('en-US') || options.port !== expectedPort) {
				throw new Error(`Активная база расширения ${options.host}:${options.port}/${options.database} не совпадает с ожидаемой ${expectedHost}:${expectedPort}/${expectedDatabase}.`);
			}
			return compilation.check(methodId, options.database, options.host, 'agent');
		},
		getMethodCompilationHistory: async (methodId: number | undefined, limit: number) => ({ records: await history.recent(methodId, limit) }),
	};
}
