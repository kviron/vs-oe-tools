import { z } from 'zod';
import { defineCommand, expectedConnection, nonempty, positiveId } from '../ai/command';
import { enumElementFields, enumElementSchema } from './enumElementCreation';
import { enumElementUpdateFields, enumElementUpdateSchema } from './enumElementUpdate';
import type { ClassAttributeDraft } from './models';

export const commands = {
	update_enum_element: defineCommand(
		z.object({ ...expectedConnection('update_enum_element'), enumUpdate: enumElementUpdateSchema }),
		async (input, actions) =>
			actions.updateEnumElement({
				...input.enumUpdate,
				expectedDatabase: input.expectedDatabase,
				expectedHost: input.expectedHost,
				expectedPort: input.expectedPort,
			}),
		{
			input: z.object(enumElementUpdateFields),
			description:
				'Редактирует имя, полное имя и порядок enum-элемента по ID. Передайте previous из последнего чтения. Проверяет конфликты изменений и записывает аудит. Пакетную привязку не проверяет. Не переносит объект между файлами. После изменения обновите кэш клиента.',
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			prepare: (enumUpdate, connection) => ({ ...connection, enumUpdate }),
		},
	),
	create_enum_element: defineCommand(
		z.object({ ...expectedConnection('create_enum_element'), enumDraft: enumElementSchema }),
		async (input, actions) =>
			actions.createEnumElement({
				...input.enumDraft,
				expectedDatabase: input.expectedDatabase,
				expectedHost: input.expectedHost,
				expectedPort: input.expectedPort,
			}),
		{
			input: z.object(enumElementFields),
			description:
				'Создаёт элемент прямого подкласса Перечисление в Enum с ID разработчика, аудитом и привязкой к конкретному файлу класса. Полное имя до 100 символов. Проверяет сохранение; после создания обновите кэш клиента.',
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			prepare: (enumDraft, connection) => ({ ...connection, enumDraft }),
		},
	),
	reveal_class: defineCommand(z.object({ id: positiveId() }), async (input, actions) => {
		await actions.revealClass(input.id);
		return { id: input.id };
	}),
	open_class: defineCommand(z.object({ id: positiveId() }), async (input, actions) => {
		await actions.revealClass(input.id);
		await actions.openClass(input.id);
		return { id: input.id };
	}),
	create_class_attribute: defineCommand(
		z.object({
			draft: z.custom<ClassAttributeDraft>(
				(value) => Boolean(value) && typeof value === 'object',
				'draft is required for create_class_attribute.',
			),
		}),
		async (input, actions) => actions.createClassAttribute(input.draft),
	),
	create_local_tool_class: defineCommand(
		z.object({
			name: nonempty('Name is required for create_local_tool_class.'),
			...expectedConnection('create_local_tool_class'),
		}),
		async (input, actions) =>
			actions.createLocalToolClass(input.name, input.expectedDatabase, input.expectedHost, input.expectedPort),
	),
};
