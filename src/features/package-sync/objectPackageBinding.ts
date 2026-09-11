export interface ObjectPackageBinding {
	objectId: number;
	objectClassId: number;
	objectSeniorId: number | null;
	objectName: string;
	className: string;
	sysFileId: number | null;
	fileName: string;
	sysGroupId: number | null;
	groupName: string;
	packageId: number | null;
	packageName: string;
	changeState: string;
	objectPath: string;
	depth: number;
}

export interface PackageBindingProblem {
	code: 'unbound-object' | 'placeholder-file' | 'unexpected-file' | 'missing-sync-state';
	objectId: number;
	message: string;
}

export function evaluatePackageBinding(
	objects: readonly ObjectPackageBinding[],
	expected?: ObjectPackageBinding,
): PackageBindingProblem[] {
	const problems: PackageBindingProblem[] = [];
	for (const object of objects) {
		if (object.sysFileId === null) {
			problems.push({
				code: 'unbound-object',
				objectId: object.objectId,
				message: `Объект «${object.objectName}» (ID ${object.objectId}) не привязан к пакетному файлу: Abstract.SysFile = NULL.`,
			});
			continue;
		}
		if (object.fileName.trim().replace(/\.pkf$/iu, '').toLocaleLowerCase('en-US') === '#package$') {
			problems.push({
				code: 'placeholder-file',
				objectId: object.objectId,
				message: `Объект «${object.objectName}» (ID ${object.objectId}) попал в #package$.pkf вместо конкретного пакетного файла.`,
			});
		}
		if (expected?.sysFileId !== null && expected?.sysFileId !== undefined && object.sysFileId !== expected.sysFileId) {
			problems.push({
				code: 'unexpected-file',
				objectId: object.objectId,
				message: `Объект «${object.objectName}» (ID ${object.objectId}) находится в SysFile ${object.sysFileId} «${object.fileName}», ожидался SysFile ${expected.sysFileId} «${expected.fileName}».`,
			});
		}
		if (!object.changeState) {
			problems.push({
				code: 'missing-sync-state',
				objectId: object.objectId,
				message: `Для пакетного файла объекта «${object.objectName}» (ID ${object.objectId}) нет записи SysPackageBase.`,
			});
		}
	}
	return problems;
}
