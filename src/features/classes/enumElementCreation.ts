import * as iconv from 'iconv-lite';
import { z } from 'zod';

export type EnumElementDraft = z.infer<typeof enumElementSchema>;

export interface EnumElementCreationRequest extends EnumElementDraft {
	expectedDatabase: string;
	expectedHost: string;
	expectedPort: number;
}

const legacyText = z
	.string()
	.refine(
		(value) => !value.includes('\0') && iconv.decode(iconv.encode(value, 'win1251'), 'win1251') === value,
		'Текст элемента нельзя сохранить в Windows-1251.',
	);
const orderMessage = 'Порядок элемента должен быть целым int32.';
export const enumElementFields = {
	classId: z.number().int().positive().safe(),
	name: legacyText.and(
		z
			.string()
			.min(1)
			.max(100)
			.regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, 'Имя элемента должно быть идентификатором длиной до 100 символов.'),
	),
	fullName: legacyText.and(
		z
			.string()
			.min(1)
			.max(100)
			.refine((value) => Boolean(value.trim()), 'Полное имя не должно быть пустым.'),
	),
	ord: z
		.number({ invalid_type_error: orderMessage })
		.int(orderMessage)
		.min(-2147483648, orderMessage)
		.max(2147483647, orderMessage),
};
export const enumElementSchema = z.object(enumElementFields);

/** The repository uses the same contract as MCP and the authenticated bridge. */
export function validateEnumElementDraft(draft: EnumElementDraft): void {
	const result = enumElementSchema.safeParse(draft);
	if (!result.success) {
		throw new Error(result.error.issues[0].message);
	}
}

export function encodeEnumElementAudit(draft: EnumElementDraft, sysFileId: number): Buffer {
	const quoted = (value: string) => `"${value.replace(/"/g, '""')}"`;
	return iconv.encode(
		`103,${quoted(draft.name)},104,${draft.ord},23102,${quoted(draft.fullName)},106,${sysFileId}`,
		'win1251',
	);
}
