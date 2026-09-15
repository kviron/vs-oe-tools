import type { AttributeDetails } from './models';

export interface NativeAttributeDraft {
	ownerClassId: number; name: string; attributeTypeId: number; valueClass: string;
	storageInDb: boolean; dbFieldName: string; isHistoric: boolean; isStatic: boolean;
	isComputedBy: boolean; computedByExpression: string; sysPackage: string;
}
export function attributeDraft(details: AttributeDetails): NativeAttributeDraft {
	const data = details.data;
	const flag = (key: string) => data[key] === true || ['-1', '1', 'true'].includes(String(data[key]).toLowerCase());
	return { ownerClassId: Number(details.ownerClassId), name: details.name, attributeTypeId: Number(data.attrtype),
		valueClass: String(data.valueclasses ?? ''), storageInDb: !flag('virtual'), dbFieldName: String(data.dbfieldname ?? ''),
		isHistoric: flag('historic'), isStatic: flag('static'), isComputedBy: flag('computedby'),
		computedByExpression: String(data.computedbyexpr ?? ''), sysPackage: '' };
}
export function validateNativeAttributeDraft(input: unknown): asserts input is NativeAttributeDraft {
	if (!input || typeof input !== 'object') {throw new Error('Не заданы данные атрибута.');}
	const d = input as NativeAttributeDraft;
	for (const key of ['name', 'valueClass', 'dbFieldName', 'computedByExpression', 'sysPackage'] as const) {
		if (typeof d[key] !== 'string') {throw new Error(`Некорректное поле: ${key}.`);}
	}
	for (const key of ['storageInDb', 'isHistoric', 'isStatic', 'isComputedBy'] as const) {
		if (typeof d[key] !== 'boolean') {throw new Error(`Некорректный флаг: ${key}.`);}
	}
	if (!Number.isSafeInteger(d.ownerClassId) || d.ownerClassId <= 0 || !Number.isSafeInteger(d.attributeTypeId) || d.attributeTypeId <= 0) {throw new Error('Выберите класс и тип атрибута.');}
	if (!d.name.trim() || d.name.trim().length > 250) {throw new Error('Имя должно содержать от 1 до 250 символов.');}
	if (d.dbFieldName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(d.dbFieldName)) {throw new Error('Поле БД должно быть SQL-идентификатором на латинице.');}
	if (d.storageInDb && !d.dbFieldName) {throw new Error('Для хранимого атрибута укажите поле БД.');}
	if (d.isComputedBy && !d.computedByExpression.trim()) {throw new Error('Укажите SQL-выражение вычисляемого атрибута.');}
	if ([322, 324, 325, 330, 333].includes(d.attributeTypeId) && !d.valueClass.trim()) {throw new Error('Укажите класс значения для ссылочного типа.');}
	if (d.valueClass.includes(',')) {throw new Error('Нативный метод принимает один класс значения: имя или ID.');}
}
export function nativeAttributeArguments(d: NativeAttributeDraft, id?: number): Record<string, unknown> {
	validateNativeAttributeDraft(d);
	if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) {throw new Error('Некорректный ID атрибута.');}
	return { ...(id === undefined ? { class: String(d.ownerClassId), ...(d.sysPackage.trim() ? { sys_package: d.sysPackage.trim() } : {}) } : { Attribute: String(id) }),
		attribute_name: d.name.trim(), attribute_type: String(d.attributeTypeId), value_class: d.valueClass.trim(),
		storage_in_db: d.storageInDb, db_field_name: d.dbFieldName.trim(), is_historic: d.isHistoric,
		is_static: d.isStatic, is_computed_by: d.isComputedBy, computed_by_expression: d.computedByExpression };
}
export function nativeAttributeResult(result: { content: { text: string }[]; isError?: boolean }): Record<string, unknown> {
	if (result.isError) {throw new Error(result.content.map(item => item.text).join('\n'));}
	const parsed = JSON.parse(result.content.map(item => item.text).join('\n'));
	const item = parsed.items?.[0];
	if (parsed.error || (item && item.status !== 'ok')) {throw new Error(String(parsed.error ?? item.error ?? 'Ошибка чтения атрибута.'));}
	const value = item?.item ?? parsed;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {throw new Error('Некорректный ответ нативного метода.');}
	return value;
}
export function assertAttributeTool(tools: { name: string; inputSchema: Record<string, unknown>; required?: string[] }[], name: string, args: Record<string, unknown>): void {
	const tool = tools.find(item => item.name === name);
	if (!tool) {throw new Error(`Клиентский MCP не поддерживает ${name}. Обновите клиент ВЭ.`);}
	const properties = tool.inputSchema.properties as Record<string, unknown> | undefined;
	const required = tool.required ?? tool.inputSchema.required;
	if (Array.isArray(required) && required.some(key => typeof key !== 'string' || !(key in args))) { throw new Error(`Не заданы обязательные параметры ${name}.`); }
	if (!properties || Object.keys(args).some(key => !(key in properties))) {throw new Error(`Схема ${name} несовместима с формой атрибута.`);}
}
