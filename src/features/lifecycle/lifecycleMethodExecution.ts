export const lifecycleFunctionsClassId = 12956150;
export const createLifecycleParameterMethodId = 3143815;

export interface LifecycleParameterSpec {
	name: string;
	displayName: string;
	kindId: number;
	ownerClassId: number;
	attributeId?: number;
	lifecycleIds?: number[];
	excludedLifecycleIds?: number[];
	roleIds?: number[];
	copyRightsFromParameter?: string;
	includeDescendants?: boolean;
	packagedOnly?: boolean;
	excludedStateTypeIds?: number[];
	additionalAttributePath?: string;
	negateAdditionalCondition?: boolean;
	additionalConditionValue?: string;
}

export function buildLifecycleMethodParameter(parameter: LifecycleParameterSpec): string {
	const values: Array<[string, string | number | boolean | undefined]> = [
		['paramName', requiredText(parameter.name, 'Имя параметра')],
		['paramFName', requiredText(parameter.displayName, 'Наименование параметра')],
		['paramKind', positiveId(parameter.kindId, 'kindId')],
		['paramAttrId', optionalPositiveId(parameter.attributeId, 'attributeId')],
		['paramLCSenior', positiveId(parameter.ownerClassId, 'ownerClassId')],
		['paramLCIds', idList(parameter.lifecycleIds, 'lifecycleIds')],
		['paramExceptLCIds', idList(parameter.excludedLifecycleIds, 'excludedLifecycleIds')],
		['paramRole', idList(parameter.roleIds, 'roleIds')],
		['paramRoleLikeParam', optionalText(parameter.copyRightsFromParameter, 'copyRightsFromParameter')],
		['paramWithChilds', parameter.includeDescendants],
		['paramInSysFile', parameter.packagedOnly],
		['paramExceptTypOfStateLC', idList(parameter.excludedStateTypeIds, 'excludedStateTypeIds')],
		['paramAddAtrPath', optionalText(parameter.additionalAttributePath, 'additionalAttributePath')],
		['paramNotAddAtrPath', parameter.negateAdditionalCondition],
		['paramValueOfAddAtrPath', optionalText(parameter.additionalConditionValue, 'additionalConditionValue')],
	];
	return values
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== '')
		.map(([name, value]) => formatPair(name, value))
		.join(',');
}

function formatPair(name: string, value: string | number | boolean): string {
	const serialized = typeof value === 'boolean' ? value ? '1' : '0' : String(value);
	const pair = `${name}=${serialized}`;
	return serialized.includes(',') ? `"${pair}"` : pair;
}

function requiredText(value: string, label: string): string {
	const normalized = optionalText(value, label);
	if (!normalized) { throw new Error(`${label} не должно быть пустым.`); }
	return normalized;
}

function optionalText(value: string | undefined, label: string): string | undefined {
	const normalized = value?.trim();
	if (!normalized) { return undefined; }
	if (/[;\r\n"]/u.test(normalized)) { throw new Error(`${label} содержит недопустимый символ.`); }
	return normalized;
}

function positiveId(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value <= 0) { throw new Error(`${label} должен быть положительным целым числом.`); }
	return value;
}

function optionalPositiveId(value: number | undefined, label: string): number | undefined {
	return value === undefined ? undefined : positiveId(value, label);
}

function idList(values: number[] | undefined, label: string): string | undefined {
	if (!values?.length) { return undefined; }
	return [...new Set(values.map(value => positiveId(value, label)))].join(',');
}
