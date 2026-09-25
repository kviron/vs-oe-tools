export interface McpClassProperty {
	id: string;
	name: string;
	aliases: string;
	ownerClassId: string;
	ownerClassName: string;
	depth: number;
	inherited: boolean;
	type: string;
	readOnly: boolean;
	visibility: string;
	package: string;
	isBinary: boolean;
}

export function selectVisibleProperties(properties: McpClassProperty[], includeShadowed: boolean): McpClassProperty[] {
	if (includeShadowed) {
		return properties;
	}
	const visible = new Map<string, McpClassProperty>();
	for (const property of properties) {
		const key = property.name.toLocaleUpperCase('ru');
		if (!visible.has(key)) {
			visible.set(key, property);
		}
	}
	return [...visible.values()];
}
