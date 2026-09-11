import { z } from '../schemas';
import { bridgeToolResult } from '../bridge';
import type { McpToolServer } from '../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('create_class_attribute', {
		description: 'DEPRECATED: this data-changing tool will be removed soon. Create a virtual attribute in an existing East Express class through the VS Code save pipeline. The operation allocates an ID from DeveloperIDs, writes Attributes/Abstract/ObjRefs and audit history atomically, inherits the owner package file, updates ClassVersion, and opens the new attribute card.',
		inputSchema: {
			ownerClassId: z.number().int().positive().describe('Owning class ID'),
			name: z.string().min(1).max(250).describe('Logical attribute name, Windows-1251'),
			aliases: z.string().max(250).optional().describe('Optional Latin script alias'),
			dbFieldName: z.string().max(250).regex(/^(?:[A-Za-z_][A-Za-z0-9_]*)?$/).optional()
				.describe('Optional Latin SQL field identifier; omit or pass an empty string for a virtual attribute'),
			attributeTypeId: z.number().int().positive().describe('Type ID from AttrTypes, for example 330 for embedded object'),
			valueClasses: z.string().optional().describe('Optional positive class IDs separated by commas'),
			visibilityId: z.number().int().positive().optional().describe('Visibility enum ID, default 12450284 (Protected)'),
			distributionModeId: z.number().int().positive().optional().describe('Distribution enum ID, default 12450505'),
			isNotNull: z.boolean().optional(),
			refIntegrityCheck: z.boolean().optional(),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async (input: {
		ownerClassId: number; name: string; aliases?: string; dbFieldName?: string; attributeTypeId: number; valueClasses?: string;
		visibilityId?: number; distributionModeId?: number; isNotNull?: boolean; refIntegrityCheck?: boolean;
	}) => bridgeToolResult({
		action: 'create_class_attribute',
		draft: {
			ownerClassId: input.ownerClassId,
			name: input.name,
			aliases: input.aliases ?? '',
			dbFieldName: input.dbFieldName ?? '',
			attributeTypeId: input.attributeTypeId,
			valueClasses: input.valueClasses ?? '',
			visibilityId: input.visibilityId ?? 12450284,
			distributionModeId: input.distributionModeId ?? 12450505,
			isNotNull: input.isNotNull ?? false,
			virtual: true,
			refIntegrityCheck: input.refIntegrityCheck ?? false,
		},
	}));
}
