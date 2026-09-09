"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLifecycleParameterMethodId = exports.lifecycleFunctionsClassId = void 0;
exports.buildLifecycleMethodParameter = buildLifecycleMethodParameter;
exports.lifecycleFunctionsClassId = 12956150;
exports.createLifecycleParameterMethodId = 3143815;
function buildLifecycleMethodParameter(parameter) {
    const values = [
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
        .filter((entry) => entry[1] !== undefined && entry[1] !== '')
        .map(([name, value]) => formatPair(name, value))
        .join(',');
}
function formatPair(name, value) {
    const serialized = typeof value === 'boolean' ? value ? '1' : '0' : String(value);
    const pair = `${name}=${serialized}`;
    return serialized.includes(',') ? `"${pair}"` : pair;
}
function requiredText(value, label) {
    const normalized = optionalText(value, label);
    if (!normalized) {
        throw new Error(`${label} не должно быть пустым.`);
    }
    return normalized;
}
function optionalText(value, label) {
    const normalized = value?.trim();
    if (!normalized) {
        return undefined;
    }
    if (/[;\r\n"]/u.test(normalized)) {
        throw new Error(`${label} содержит недопустимый символ.`);
    }
    return normalized;
}
function positiveId(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label} должен быть положительным целым числом.`);
    }
    return value;
}
function optionalPositiveId(value, label) {
    return value === undefined ? undefined : positiveId(value, label);
}
function idList(values, label) {
    if (!values?.length) {
        return undefined;
    }
    return [...new Set(values.map(value => positiveId(value, label)))].join(',');
}
//# sourceMappingURL=lifecycleMethodExecution.js.map