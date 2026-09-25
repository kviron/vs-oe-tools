import { bindObjectsToPackage } from '../../infrastructure/database/objectPackageBindingRepository';
import { loadPackageSyncItems } from '../../infrastructure/database/packageSyncRepository';

export function createPackageSyncAgentActions() {
	return {
		bindObjectsToPackage: async (request: Parameters<typeof bindObjectsToPackage>[0]) => ({ ...await bindObjectsToPackage(request) }),
		getPackageSyncChanges: async (query: string | undefined, offset: number, limit: number) => {
			const items = await loadPackageSyncItems();
			const normalizedQuery = query?.trim().toLocaleLowerCase('ru');
			const filtered = normalizedQuery
				? items.filter(item => [item.objectId, item.objectName, item.objectPath, item.packagePath, item.changeState, item.localPath]
					.some(value => String(value ?? '').toLocaleLowerCase('ru').includes(normalizedQuery)))
				: items;
			return {
				query: query ?? null,
				offset,
				limit,
				totalCount: filtered.length,
				count: Math.min(limit, Math.max(0, filtered.length - offset)),
				hasMore: offset + limit < filtered.length,
				items: filtered.slice(offset, offset + limit),
			};
		},
	};
}
