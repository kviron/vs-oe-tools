import { z } from '../../schemas';
import { createLifecycleParameterMethodId, buildLifecycleMethodParameter } from '../../../features/lifecycle/lifecycleMethodExecution';
import { loadActiveDatabaseOptions } from '../../database';
import { bridgeToolResult } from '../../bridge';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('execute_lifecycle_method', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Immediately execute the allowlisted static method Функции_ЖЦ.СоздатьПараметрИПраво (3143815) through the native OEExecTask runtime. It creates ParameterLC records and optional RightLC records without creating or running an SPU. Call get_active_database first and verify the target. Other Функции_ЖЦ methods require runtime object parameters and are not exposed.',
		inputSchema: {
			methodId: z.literal(createLifecycleParameterMethodId).describe('Allowlisted static method ID 3143815'),
			parameters: z.object({
				name: z.string().min(1).max(250),
				displayName: z.string().min(1).max(500),
				kindId: z.number().int().positive().describe('ParameterLC kind, for example 8927425 view or 8927426 edit'),
				ownerClassId: z.number().int().positive().describe('Lifecycle owner class used when lifecycleIds is omitted'),
				attributeId: z.number().int().positive().optional(),
				lifecycleIds: z.array(z.number().int().positive()).max(500).optional(),
				excludedLifecycleIds: z.array(z.number().int().positive()).max(500).optional(),
				roleIds: z.array(z.number().int().positive()).max(500).optional(),
				copyRightsFromParameter: z.string().max(250).optional(),
				includeDescendants: z.boolean().optional(),
				packagedOnly: z.boolean().optional(),
				excludedStateTypeIds: z.array(z.number().int().positive()).max(100).optional(),
				additionalAttributePath: z.string().max(1000).optional(),
				negateAdditionalCondition: z.boolean().optional(),
				additionalConditionValue: z.string().max(1000).optional(),
			}),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	}, async (input: { methodId: typeof createLifecycleParameterMethodId; parameters: Parameters<typeof buildLifecycleMethodParameter>[0] }) => {
		const options = await loadActiveDatabaseOptions();
		return bridgeToolResult({
			action: 'execute_lifecycle_method',
			id: input.methodId,
			methodParameter: buildLifecycleMethodParameter(input.parameters),
			database: options.database,
			host: options.host,
		});
	});
}
