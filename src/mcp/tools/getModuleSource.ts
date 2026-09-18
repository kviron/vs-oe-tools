import { z, sourceExcerptSchema } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabaseRaw } from '../databaseSession';
import { decodeSourceValue, createSourceExcerpt } from '../sourceContent';
import type { McpToolServer } from '../toolTypes';

interface ModuleSourceRow extends Record<string, unknown> {
	id: number | string;
	name: string;
	ownerid: number | string;
	ownername: string;
	ownerclassid: number | string;
	ownerclassname: string;
	code: unknown;
	codetype: string;
}

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_module_source', {
		description: 'Read the complete decoded Windows-1251 source code of an East Express module object, including report code. Use lookup_object_by_id first when the object type is unknown.',
		inputSchema: {
			moduleId: z.number().int().positive().describe('Existing object ID whose meta-class is Модуль (ClassID=33)'),
			...sourceExcerptSchema,
		},
		annotations: { readOnlyHint: true },
	}, async ({ moduleId, startLine, maxLines }: { moduleId: number; startLine?: number; maxLines?: number }) => databaseToolResult(async () => {
		const rows = await queryDatabaseRaw<ModuleSourceRow>(
			`SELECT module.id, COALESCE(NULLIF(module.name, ''), NULLIF(owner.name, ''), 'Модуль ' || module.id::text) AS name,
			        owner.id AS ownerid, owner.name AS ownername, owner.classid AS ownerclassid,
			        owner_class.name AS ownerclassname,
			        module.code, pg_typeof(module.code)::text AS codetype
			   FROM modules AS module
			   JOIN abstract AS object ON object.id = module.id AND object.classid = 33
			   JOIN abstract AS owner ON owner.id = module.seniorid
			   LEFT JOIN classes AS owner_class ON owner_class.id = owner.classid
			  WHERE module.id = $1`,
			[moduleId],
		);
		const module = rows[0];
		if (!module) { throw new Error(`Module ${moduleId} was not found.`); }
		return {
			found: true,
			moduleId: String(module.id),
			name: module.name,
			ownerId: String(module.ownerid),
			ownerName: module.ownername,
			ownerClassId: String(module.ownerclassid),
			ownerClassName: module.ownerclassname,
			codeType: module.codetype,
			source: createSourceExcerpt(decodeSourceValue(module.code), startLine, maxLines),
		};
	}));
}
