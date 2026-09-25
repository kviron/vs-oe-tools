import { z, sourceExcerptSchema } from '../../schemas';
import { databaseToolResult } from '../../toolResult';
import { queryDatabaseRaw } from '../../database';
import { type MethodSourceRow } from '../../queries/methodQueries';
import { decodeSourceValue, createSourceExcerpt } from '../../queries/sourceContent';
import type { McpToolServer } from '../../toolTypes';

export function registerTool(server: McpToolServer): void {
	server.registerTool('get_method_source', {
		description: 'Read decoded Windows-1251 source code of an East Express method for analysis. Returns numbered lines and pagination metadata.',
		inputSchema: {
			methodId: z.number().int().positive().describe('Method ID returned by search_methods'),
			...sourceExcerptSchema,
		},
		annotations: { readOnlyHint: true },
	}, async ({ methodId, startLine, maxLines }: { methodId: number; startLine?: number; maxLines?: number }) => databaseToolResult(async () => {
		const rows = await queryDatabaseRaw<MethodSourceRow>(
			`SELECT method.id, method.name, method.seniorid AS classid, owner.name AS classname,
		        method.methtype, method.signature, method.code, pg_typeof(method.code)::text AS codetype
		   FROM methods AS method
		   LEFT JOIN abstract AS owner ON owner.id = method.seniorid
		  WHERE method.id = $1`,
			[methodId],
		);
		const method = rows[0];
		if (!method) {
			throw new Error(`Method ${methodId} was not found.`);
		}
		return {
			found: true,
			methodId: String(method.id),
			name: method.name,
			classId: String(method.classid),
			className: method.classname,
			methodType: method.methtype,
			signature: decodeSourceValue(method.signature),
			codeType: method.codetype,
			source: createSourceExcerpt(decodeSourceValue(method.code), startLine, maxLines),
		};
	}));
}
