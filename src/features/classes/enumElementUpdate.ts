import { enumElementFields, type EnumElementCreationRequest } from './enumElementCreation';
import { z } from 'zod';
export const enumElementUpdateFields = {
	...enumElementFields,
	objectId: z.number().int().positive().safe(),
	previous: z.object(
		{ name: z.string(), fullName: z.string(), ord: z.number().int() },
		{ required_error: 'Укажите previous из последнего чтения элемента.' },
	),
};
export const enumElementUpdateSchema = z.object(enumElementUpdateFields);
export type EnumElementUpdateDraft = z.infer<typeof enumElementUpdateSchema>;
export type EnumElementUpdateRequest = EnumElementUpdateDraft &
	Pick<EnumElementCreationRequest, 'expectedDatabase' | 'expectedHost' | 'expectedPort'>;
export function validateEnumElementUpdate(draft: EnumElementUpdateDraft): void {
	const result = enumElementUpdateSchema.safeParse(draft);
	if (!result.success) {
		throw new Error(result.error.issues[0].message);
	}
}
