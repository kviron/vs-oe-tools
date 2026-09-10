

export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

export function normalizeValue(value: unknown): unknown {
	if (typeof value === 'bigint') {
		return value.toString();
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Buffer.isBuffer(value)) {
		return `<binary: ${value.byteLength} bytes>`;
	}
	return value;
}

export async function databaseToolResult(load: () => Promise<Record<string, unknown>>) {
	try {
		const result = await load();
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
			structuredContent: result,
		};
	} catch (error) {
		return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
	}
}
