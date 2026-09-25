import type { ExtensionLogService } from '../../infrastructure/logging/extensionLogService';
import { executeOeStaticMethod, startClientMcpProcess } from './oeStaticMethodExecutor';

export function createLifecycleAgentActions(
	workspacePath: string | undefined,
	getCredentials: () => Promise<{ username: string; password: string | undefined }>,
	logger: ExtensionLogService,
) {
	return {
		executeLifecycleMethod: async (methodId: number, methodParameter: string, database: string, host: string) => {
			if (!workspacePath) { throw new Error('Открытая папка проекта не найдена.'); }
			const result = await executeOeStaticMethod(workspacePath, methodId, methodParameter, database, host, await getCredentials());
			logger.info('MCP method', `Выполнен статический метод ${methodId}.`, { database });
			return { ...result };
		},
		startClientMcp: async (database: string, host: string) => {
			if (!workspacePath) { throw new Error('Открытая папка проекта не найдена.'); }
			const result = await startClientMcpProcess(workspacePath, database, host, await getCredentials());
			logger.info('MCP client', 'Клиентский MCP автоматически запущен по запросу агента.', { database });
			return result;
		},
	};
}
