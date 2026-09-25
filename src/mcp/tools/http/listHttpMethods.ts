import { queryDatabaseRaw } from '../../database';
import { databaseToolResult } from '../../toolResult';
import type { McpToolServer } from '../../toolTypes';
import * as iconv from 'iconv-lite';

export function registerTool(server: McpToolServer): void {
	server.registerTool('list_http_methods', {
		description: 'List the East Express HttpMethods entries available for REST testing, including method IDs, signatures, and descriptions.',
		inputSchema: {},
		annotations: { readOnlyHint: true },
	}, async () => databaseToolResult(async () => {
		const methods = await queryDatabaseRaw<{
			id: number; name: string; methodid: number; signature: Buffer | string | null; description: Buffer | string | null;
		}>(`SELECT http.id, http.name, http.method AS methodid, method.signature, http.description
			FROM httpmethods http
			INNER JOIN methods method ON method.id = http.method
			ORDER BY http.name`, []);
		return {
			count: methods.length,
			methods: methods.map(method => ({
				id: Number(method.id), name: method.name, methodId: Number(method.methodid),
				signature: Buffer.isBuffer(method.signature) ? iconv.decode(method.signature, 'win1251') : (method.signature ?? ''),
				description: Buffer.isBuffer(method.description) ? iconv.decode(method.description, 'win1251') : (method.description ?? ''),
			})),
		};
	}));
}
