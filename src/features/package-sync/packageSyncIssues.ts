import type { PackagePlaceholderIssue, PackageSyncItem } from './models';

const packagePlaceholder = '#package$';

export interface PackagePlaceholderObject {
	objectId: number;
	objectName: string;
	objectType: string;
}

export function isPackagePlaceholderItem(item: PackageSyncItem): boolean {
	return [item.localPath, item.objectPath].filter((value): value is string => Boolean(value)).some(value => value.split(/[\\/]+/u)
		.some(segment => segment.trim().replace(/\.pkf$/iu, '').toLocaleLowerCase('en-US') === packagePlaceholder));
}

export function parsePackagePlaceholderObjects(content: string): PackagePlaceholderObject[] {
	const objects: PackagePlaceholderObject[] = [];
	const declaration = /^\s*object\s+(?:\$"([^"]+)"|([^\s:]+))\s*:\s*([^\r\n;]+)\s*\r?\n\s*_Ид\s*=\s*'(\d+)'\s*;/gimu;
	for (const match of content.matchAll(declaration)) {
		objects.push({
			objectId: Number(match[4]),
			objectName: match[1] ?? match[2],
			objectType: match[3].trim(),
		});
	}
	return objects;
}

export function createPackagePlaceholderIssues(
	item: PackageSyncItem,
	filePath: string,
	objects: readonly PackagePlaceholderObject[],
): PackagePlaceholderIssue[] {
	return objects.map(object => ({
		objectId: object.objectId,
		objectName: object.objectName,
		classId: null,
		className: object.objectType,
		packagePath: item.packagePath,
		objectPath: item.objectPath,
		filePath,
		changedBy: item.changedBy,
		message: `Объект «${object.objectName}» (ID ${object.objectId}) попал в ${packagePlaceholder}.pkf — извлеките его из этого файла`,
		type: 'package-placeholder',
	}));
}
