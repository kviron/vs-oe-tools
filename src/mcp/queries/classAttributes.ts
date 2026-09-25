export interface McpClassAttribute {
	id: string;
	name: string;
	ownerClassId: string;
	ownerClassName: string;
	depth: number;
	inherited: boolean;
	type: string;
	dbFieldName: string;
	data: Record<string, unknown>;
}

export function readAttributeValue(row: Record<string, unknown>, ...names: string[]): string {
	const values = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
	for (const name of names) {
		const value = values.get(name.toLowerCase());
		if (value !== undefined && value !== null) {
			return String(value);
		}
	}
	return '';
}

export function selectVisibleAttributes(attributes: McpClassAttribute[], includeShadowed: boolean): McpClassAttribute[] {
	if (includeShadowed) {
		return attributes;
	}
	const visible = new Map<string, McpClassAttribute>();
	for (const attribute of attributes) {
		const key = attribute.name.toLocaleUpperCase('ru');
		if (!visible.has(key)) {
			visible.set(key, attribute);
		}
	}
	return [...visible.values()];
}

export function quotePostgresIdentifier(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}
