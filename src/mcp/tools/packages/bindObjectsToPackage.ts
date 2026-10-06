import { commands as featureCommands } from '../../../features/package-sync/commands';
import { bridgeToolResult } from '../../bridge';
import { loadActiveDatabaseOptions } from '../../database';
import type { McpToolServer } from '../../toolTypes';

interface BindObjectsInput {
	objectIds: number[];
	templateObjectId?: number;
	sysFileId?: number;
}

export function registerTool(server: McpToolServer): void {
	server.registerTool('bind_objects_to_package', {
		description: 'Atomically bind or move the specified East Express metadata objects to one concrete package file. Existing Abstract.SysFile bindings are replaced with the selected target. Prefer templateObjectId from a correctly bound owner or peer; sysFileId is also supported. Rejects a #package$ target, missing objects, duplicate IDs and target ambiguity. Locks objects, verifies current_database(), registers changes for both source and destination files in SysPackageBase, commits and re-reads every object. Returns previous file IDs for moved objects',
		inputSchema: {
			objectIds: featureCommands.bind_objects_to_package.schema.innerType().shape.objectIds.describe('Object IDs to bind or move atomically'),
			templateObjectId: featureCommands.bind_objects_to_package.schema.innerType().shape.templateObjectId.describe('Correctly bound owner or peer whose concrete SysFile should be reused'),
			sysFileId: featureCommands.bind_objects_to_package.schema.innerType().shape.sysFileId.describe('Exact concrete SysFile ID; use only when already verified'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	}, async ({ objectIds, templateObjectId, sysFileId }: BindObjectsInput) => {
		const options = await loadActiveDatabaseOptions();
		return bridgeToolResult({
			action: 'bind_objects_to_package', objectIds, templateObjectId, sysFileId,
			expectedDatabase: options.database, expectedHost: options.host, expectedPort: options.port,
		});
	});
}
