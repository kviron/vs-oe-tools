import { openProjectClientEntity, startProjectClient, updateProjectBinaries, updateProjectDatabase, updateProjectPackages } from './projectCommandService';

export function createProjectAgentActions(getCredentials: () => Promise<{ username: string; password: string | undefined }>) {
	return {
		updatePackages: () => updateProjectPackages(),
		updateBinaries: () => updateProjectBinaries(),
		updateDatabase: (role: 'main' | 'test') => updateProjectDatabase(role),
		startClient: async (role: 'main' | 'test') => startProjectClient(role, await getCredentials()),
		openClientEntity: async (role: 'main' | 'test', entityType: string, id: number) => openProjectClientEntity(role, entityType, id, await getCredentials()),
	};
}
