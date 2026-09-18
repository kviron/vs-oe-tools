export interface PackageBindingTarget {
	templateObjectId?: number;
	sysFileId?: number;
}

export interface PackageBindingMutationRequest extends PackageBindingTarget {
	objectIds: number[];
	expectedDatabase: string;
	expectedHost: string;
	expectedPort: number;
}

export function validatePackageBindingMutationRequest(request: PackageBindingMutationRequest): void {
	if (!Array.isArray(request.objectIds) || request.objectIds.length === 0 || request.objectIds.length > 100
		|| request.objectIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
		throw new Error('objectIds должен содержать от 1 до 100 положительных целочисленных ID.');
	}
	if (new Set(request.objectIds).size !== request.objectIds.length) {
		throw new Error('objectIds не должен содержать повторяющиеся ID.');
	}
	const hasTemplate = request.templateObjectId !== undefined;
	const hasFile = request.sysFileId !== undefined;
	if (hasTemplate === hasFile) {
		throw new Error('Укажите ровно одну цель: templateObjectId или sysFileId.');
	}
	const targetId = request.templateObjectId ?? request.sysFileId;
	if (!Number.isSafeInteger(targetId) || (targetId ?? 0) <= 0) {
		throw new Error('ID цели пакетной привязки должен быть положительным целым числом.');
	}
	if (!request.expectedDatabase.trim()) {
		throw new Error('expectedDatabase обязателен для защиты от изменения не той базы.');
	}
	if (!request.expectedHost.trim() || !Number.isInteger(request.expectedPort)
		|| request.expectedPort < 1 || request.expectedPort > 65535) {
		throw new Error('expectedHost и expectedPort обязательны для защиты от изменения не того подключения.');
	}
}
