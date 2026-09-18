export interface WorkDescriptionPart {
	text: string;
	id?: number;
	kind?: 'object' | 'task';
	href?: string;
}

const linkPattern = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]|\b[1-9]\d{3,}\b/g;

export function splitWorkDescriptionObjectIds(value: string, unqualifiedNumericKind?: 'object' | 'task'): WorkDescriptionPart[] {
	const parts: WorkDescriptionPart[] = [];
	let offset = 0;
	for (const match of value.matchAll(linkPattern)) {
		const matchOffset = match.index;
		const text = match[0];
		if (/^https?:\/\//i.test(text)) {
			if (matchOffset > offset) { parts.push({ text: value.slice(offset, matchOffset) }); }
			parts.push({ text, href: text });
			offset = matchOffset + text.length;
			continue;
		}
		const id = Number(text);
		if (!Number.isSafeInteger(id)) { continue; }
		const prefix = value.slice(Math.max(0, matchOffset - 40), matchOffset);
		const contextualTask = /задач\p{L}*\s*(?:№|#|id)?\s*$/ui.test(prefix);
		const isTask = unqualifiedNumericKind === 'task' || contextualTask;
		if (unqualifiedNumericKind === 'task' && !contextualTask && text.length < 5) { continue; }
		if (!isTask && text.length < 7) { continue; }
		if (matchOffset > offset) { parts.push({ text: value.slice(offset, matchOffset) }); }
		parts.push({ text, id, kind: isTask ? 'task' : 'object' });
		offset = matchOffset + text.length;
	}
	if (offset < value.length || parts.length === 0) { parts.push({ text: value.slice(offset) }); }
	return parts;
}
