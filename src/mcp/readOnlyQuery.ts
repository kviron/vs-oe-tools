const allowedFirstKeywords = new Set(['SELECT', 'WITH', 'VALUES']);

export const defaultMcpRowLimit = 200;
export const maximumMcpRowLimit = 500;

export function prepareReadOnlyQuery(sql: string, requestedLimit = defaultMcpRowLimit): string {
	const normalized = stripLeadingComments(sql).trim().replace(/;+\s*$/, '');
	if (!normalized) {
		throw new Error('SQL query must not be empty.');
	}

	const firstKeyword = normalized.match(/^([a-z]+)/i)?.[1]?.toUpperCase();
	if (!firstKeyword || !allowedFirstKeywords.has(firstKeyword)) {
		throw new Error('Only SELECT, WITH and VALUES queries are allowed.');
	}

	const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), maximumMcpRowLimit);
	return `SELECT * FROM (\n${normalized}\n) AS vc_ve_mcp_result\nLIMIT ${limit + 1}`;
}

function stripLeadingComments(sql: string): string {
	let value = sql;
	while (true) {
		const next = value
			.replace(/^\s*--[^\r\n]*(?:\r?\n|$)/, '')
			.replace(/^\s*\/\*[\s\S]*?\*\//, '');
		if (next === value) {
			return value;
		}
		value = next;
	}
}
