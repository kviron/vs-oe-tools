/** Extracts one method body from a serialized PKF meta-class. */
export function extractPkfMethodSource(source: string, methodId: number): string | undefined {
	if (!Number.isSafeInteger(methodId) || methodId <= 0) { return undefined; }
	const lines = source.split(/\r?\n/u);
	const declarationPattern = new RegExp(`(?:\\[_Ид\\s*=\\s*'${methodId}'\\s*\\]|^\\s*_Ид\\s*=\\s*'${methodId}'\\s*;)`, 'iu');
	const declarationIndex = lines.findIndex(line => declarationPattern.test(line));
	if (declarationIndex < 0) { return undefined; }

	const openingIndex = lines.findIndex((line, index) => index > declarationIndex && /^\s*(?:КодМодуля\s*=\s*)?\{\{\s*$/iu.test(line));
	if (openingIndex < 0) { return undefined; }
	const indentation = lines[openingIndex]!.match(/^\s*/u)?.[0] ?? '';
	const closingPattern = new RegExp(`^${escapeRegExp(indentation)}\\}\\};\\s*$`, 'u');
	const closingIndex = lines.findIndex((line, index) => index > openingIndex && closingPattern.test(line));
	if (closingIndex < 0) { return undefined; }

	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	return lines.slice(openingIndex + 1, closingIndex)
		.map(line => line.startsWith(indentation) ? line.slice(indentation.length) : line)
		.join(newline);
}

export function extractPkfMethodChange(beforeFile: string, afterFile: string, methodId: number): { before: string; after: string } | undefined {
	const before = extractPkfMethodSource(beforeFile, methodId) ?? '';
	const after = extractPkfMethodSource(afterFile, methodId) ?? '';
	return normalizeNewlines(before) === normalizeNewlines(after) ? undefined : { before, after };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function normalizeNewlines(value: string): string {
	return value.replace(/\r\n/g, '\n');
}
