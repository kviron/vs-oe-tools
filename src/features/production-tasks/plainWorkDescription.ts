export interface PlainWorkDescriptionBlock {
	kind: 'paragraph' | 'ordered-list' | 'unordered-list';
	items: Array<{ text: string; number?: number }>;
}

/** Recognizes explicit plain-text paragraphs and list markers without inventing formatting. */
export function parsePlainWorkDescription(source: string): PlainWorkDescriptionBlock[] {
	const lines = source.replace(/\\u000[dD]/g, '\r').replace(/\\u000[aA]/g, '\n')
		.replace(/\r\n?/g, '\n').split('\n');
	const blocks: PlainWorkDescriptionBlock[] = [];
	let current: PlainWorkDescriptionBlock | undefined;
	for (const line of lines) {
		if (!line.trim()) {
			// A standalone "1." may be followed by a blank line before its text.
			if (current?.kind === 'ordered-list' && !current.items.at(-1)?.text) { continue; }
			current = undefined;
			continue;
		}
		const numbered = /^ {0,3}(\d{1,3})[.)](?:[ \t]+(.*)|[ \t]*)$/.exec(line);
		const bullet = /^ {0,3}[-*•][ \t]+(.+)$/.exec(line);
		const kind = numbered ? 'ordered-list' : bullet ? 'unordered-list' : undefined;
		if (kind) {
			if (current?.kind !== kind) { current = { kind, items: [] }; blocks.push(current); }
			current.items.push({ text: numbered ? numbered[2] ?? '' : bullet![1], ...(numbered ? { number: Number(numbered[1]) } : {}) });
		} else if (current) {
			const item = current.items.at(-1)!;
			item.text += `${item.text ? '\n' : ''}${line}`;
		} else {
			current = { kind: 'paragraph', items: [{ text: line }] };
			blocks.push(current);
		}
	}
	return blocks;
}
