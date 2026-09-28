import type { ExplorerHostMessage } from '../../core/webviewProtocol';
import type { ExplorerDependencies } from './explorerViewProvider';

type DataDependencies = Pick<ExplorerDependencies,
	'getClasses' | 'getPackages' | 'getPackageTree' | 'getPackageFileContent' | 'searchObjects'>;

export interface ExplorerDataResponses {
	sendClasses(): Promise<void>;
	sendPackages(): Promise<void>;
	sendPackageTree(packageId: number): Promise<void>;
	sendPackageFileObjects(fileId: number): Promise<void>;
	sendObjectSearch(query: string): Promise<void>;
}

/** Converts data requests into the corresponding loading, success, and failure messages. */
export function createExplorerDataResponses(
	dependencies: DataDependencies,
	postMessage: (message: ExplorerHostMessage) => Promise<void>,
): ExplorerDataResponses {
	return {
		async sendClasses() {
			try {
				await postMessage({ command: 'classesLoaded', classes: await dependencies.getClasses() });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				await postMessage({ command: 'classesLoadFailed', message });
			}
		},
		async sendPackages() {
			try { await postMessage({ command: 'packagesLoaded', packages: await dependencies.getPackages() }); }
			catch (error) { await postMessage({ command: 'packagesLoadFailed', message: error instanceof Error ? error.message : String(error) }); }
		},
		async sendPackageTree(packageId) {
			await postMessage({ command: 'packageTreeLoading', packageId });
			try { await postMessage({ command: 'packageTreeLoaded', packageId, tree: await dependencies.getPackageTree(packageId) }); }
			catch (error) { await postMessage({ command: 'packageTreeLoadFailed', packageId, message: error instanceof Error ? error.message : String(error) }); }
		},
		async sendPackageFileObjects(fileId) {
			try { await postMessage({ command: 'packageFileObjectsLoaded', fileId, objects: (await dependencies.getPackageFileContent(fileId)).objects }); }
			catch (error) { await postMessage({ command: 'packageFileObjectsLoadFailed', fileId, message: error instanceof Error ? error.message : String(error) }); }
		},
		async sendObjectSearch(query) {
			const normalized = query.trim();
			if (!normalized) {
				await postMessage({ command: 'databaseObjectsLoaded', query: normalized, objects: [] });
				return;
			}
			await postMessage({ command: 'databaseObjectsLoading', query: normalized });
			try {
				await postMessage({ command: 'databaseObjectsLoaded', query: normalized, objects: await dependencies.searchObjects(normalized) });
			} catch (error) {
				await postMessage({ command: 'databaseObjectsLoadFailed', query: normalized, message: error instanceof Error ? error.message : String(error) });
			}
		},
	};
}
