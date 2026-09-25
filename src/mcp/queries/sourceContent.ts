import * as iconv from 'iconv-lite';

export const defaultSourceLineLimit = 1000;
export const maximumSourceLineLimit = 5000;

export interface SourceExcerpt {
	text: string;
	totalLines: number;
	startLine: number;
	endLine: number;
	truncated: boolean;
}

export function decodeSourceValue(value: unknown): string {
	if (Buffer.isBuffer(value)) {
		return iconv.decode(value, 'win1251');
	}
	const text = value === null || value === undefined ? '' : String(value);
	const bytea = text.match(/^\\x([\da-f]+)$/i);
	return bytea && bytea[1].length % 2 === 0
		? iconv.decode(Buffer.from(bytea[1], 'hex'), 'win1251')
		: text;
}

export function createSourceExcerpt(source: string, requestedStartLine = 1, requestedMaxLines = defaultSourceLineLimit): SourceExcerpt {
	const lines = source.split(/\r?\n/);
	const totalLines = lines.length;
	const startLine = Math.min(Math.max(Math.trunc(requestedStartLine), 1), totalLines);
	const maxLines = Math.min(Math.max(Math.trunc(requestedMaxLines), 1), maximumSourceLineLimit);
	const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
	const endLine = startLine + selected.length - 1;
	const width = String(endLine).length;
	return {
		text: selected.map((line, index) => `${String(startLine + index).padStart(width, ' ')} | ${line}`).join('\n'),
		totalLines,
		startLine,
		endLine,
		truncated: startLine > 1 || endLine < totalLines,
	};
}
