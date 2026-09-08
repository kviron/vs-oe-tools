import type { PackagePlaceholderIssue, PackageSyncItem } from './models';

const referenceClassId = 10;
const packagePlaceholder = '#package$';

export function findPackagePlaceholderIssues(items: readonly PackageSyncItem[]): PackagePlaceholderIssue[] {
	return items.filter(item => item.objectClassId === referenceClassId && isInsidePackagePlaceholder(item))
		.map(item => ({
			objectId: item.objectId,
			objectName: item.objectName || `#${item.objectId}`,
			classId: item.objectClassId,
			className: 'РефОбъект',
			packagePath: item.packagePath,
			objectPath: item.objectPath,
			changedBy: item.changedBy,
			message: `ID ${item.objectId} попал в ${packagePlaceholder}`,
			type: 'package-placeholder',
		}));
}

function isInsidePackagePlaceholder(item: PackageSyncItem): boolean {
	return [item.packagePath, item.objectPath].some(value => value.split(/[\\/]+/u)
		.some(segment => segment.trim().toLocaleLowerCase('en-US') === packagePlaceholder));
}
