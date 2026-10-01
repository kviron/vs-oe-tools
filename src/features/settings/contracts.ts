import type { DatabaseRole } from '../../core/database';
import type { ClientMcpService } from './clientMcpService';
import type { HttpApiService } from './httpApiService';

/** Only project operations exposed by the settings UI. */
export interface SettingsProjectActions {
	setProjectRootEnabled(enabled: boolean): Promise<void>;
	validateClientLaunchArguments(value: string): unknown;
	updateDatabase(role: DatabaseRole): Promise<unknown>;
	startClient(role: DatabaseRole): Promise<unknown>;
	updatePackages(): Promise<unknown>;
	updateBinaries(): Promise<unknown>;
}

/** UI-facing operations; process internals stay in their services. */
export interface SettingsServices {
	clientMcp: Pick<ClientMcpService, 'scheduleDatabaseSync' | 'changeRunning' | 'refreshTools' | 'recordToolsError' | 'getStatus' | 'tools' | 'toolsDatabase' | 'toolsUpdatedAt' | 'toolsError'>;
	httpApi: Pick<HttpApiService, 'executeRequest' | 'searchParameterValues' | 'start' | 'stop' | 'callServer' | 'callDirect' | 'getServerState' | 'dispose' | 'loadMethodsForState' | 'server' | 'methods' | 'methodsError'>;
}
