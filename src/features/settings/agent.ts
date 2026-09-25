import type { SettingsViewProvider } from './settingsViewProvider';

export function createHttpTestAgentActions(settings: SettingsViewProvider) {
	return {
		startHttpTestServer: (methodName: string) => settings.startHttpTestServer(methodName),
		stopHttpTestServer: () => settings.stopHttpTestServer(),
		getHttpTestServerStatus: async () => settings.getHttpTestServerState(),
		callHttpTestServer: (request: { method: string; methodName?: string; headers?: Record<string, string>; body?: string }) => settings.callHttpTestServer(request),
	};
}
