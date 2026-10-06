import { z } from 'zod';
import { defineCommand, positiveId, role, expectedConnection } from '../ai/command';

const patchFields = {
	role: role('execute_patch'), patchFile: z.string().min(1),
	packageChanges: z.enum(['deny', 'allowAndLog']).optional()
		.describe('Default deny; allowAndLog adds -allowandlogpkgchanges to OEPatch'),
};

export const commands = {
	execute_patch: defineCommand(
		z.object({ ...patchFields, ...expectedConnection('execute_patch') }),
		async (input, actions) => actions.executePatch(input),
		{
			input: z.object({ ...patchFields, ...expectedConnection('execute_patch') }),
			description: 'Применяет один патч RDE или SQL в Windows-1251 через штатный OEPatch.exe к явно указанной основной или тестовой базе. VS Code подтверждает точный текст и подключение перед выполнением. Возвращает журналы и признак возможных частичных изменений; не повторяйте неудачный запуск автоматически.',
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
			timeoutMs: 1_800_000,
			prepare: (input) => input,
		},
	),
	update_packages: defineCommand(z.object({}), async (_input, actions) => ({
		launched: await actions.updatePackages(),
	})),
	update_binaries: defineCommand(z.object({}), async (_input, actions) => ({
		launched: await actions.updateBinaries(),
	})),
	update_database: defineCommand(z.object({ role: role('update_database') }), async (input, actions) => {
		await actions.updateDatabase(input.role);
		return { role: input.role };
	}),
	start_client: defineCommand(z.object({ role: role('start_client') }), async (input, actions) => {
		await actions.startClient(input.role);
		return { role: input.role };
	}),
	get_client_status: defineCommand(z.object({ role: role('get_client_status') }), async (input, actions) => ({
		...(await actions.getClientStatus(input.role)),
	})),
	open_client_entity: defineCommand(
		z.object({ id: positiveId(), role: role('open_client_entity'), entityType: z.string().optional() }),
		async (input, actions) => ({
			role: input.role,
			entityType: input.entityType,
			id: input.id,
			uri: await actions.openClientEntity(input.role, input.entityType, input.id),
		}),
	),
};
