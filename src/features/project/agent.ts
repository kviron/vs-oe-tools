import { startProjectClient } from './clientLaunchService';
import { openProjectClientEntity } from './clientNavigationService';
import { updateProjectPackages } from './packageUpdateService';
import { updateProjectDatabase } from './databaseUpdate';
import { updateProjectBinaries } from './binaryUpdate';
import { getProjectClientStatus } from './clientStatusService';

export function createProjectAgentActions(getCredentials: () => Promise<{ username: string; password: string | undefined }>) {
	return {
		updatePackages: () => updateProjectPackages(),
		updateBinaries: () => updateProjectBinaries(),
		updateDatabase: (role: 'main' | 'test') => updateProjectDatabase(role),
		startClient: async (role: 'main' | 'test') => startProjectClient(role, await getCredentials()),
		getClientStatus: getProjectClientStatus,
		openClientEntity: (role: 'main' | 'test', entityType: string | undefined, id: number) => openProjectClientEntity(role, entityType, id),
	};
}
