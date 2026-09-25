import { z } from '../../schemas';
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
		description: 'Atomically bind newly created East Express metadata objects whose Abstract.SysFile is NULL to one concrete package file. This tool does not move existing objects between files: for an already bound method, use the package interface or metadata editor and move it to the selected file (for example, Консультант → Класс_Объект). Prefer templateObjectId from a correctly bound owner or peer; sysFileId is also supported. The tool refuses #package$, missing objects, duplicate IDs, target ambiguity, and moving objects already bound to another file. It verifies current_database(), registers SysPackageBase change state, commits, and re-reads every object.',
		inputSchema: {
			objectIds: z.array(z.number().int().positive()).min(1).max(100).describe('New object IDs to bind atomically'),
			templateObjectId: z.number().int().positive().optional().describe('Correctly bound owner or peer whose concrete SysFile should be reused'),
			sysFileId: z.number().int().positive().optional().describe('Exact concrete SysFile ID; use only when already verified'),
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
